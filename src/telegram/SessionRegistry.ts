import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels as piGetSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  AgentSession,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  type PromptOptions,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api } from "grammy";
import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  loadState,
  saveStateAtomic,
  type LogsMode,
  type TelegramConfig,
  type TelegramState,
  type ThinkingLevelOpt,
  type ThreadSettings,
} from "./config";
import { modelId, resolveModel } from "./model";
import { buildSendFileTool } from "./files/tool";
import type { Scheduler } from "./tasks/Scheduler";
import { buildTaskTool } from "./tasks/tool";
import { loadWrappedThreadInstruction } from "./threadInstruction";

export type SessionKey = string;

export type ThreadHandle = {
  readonly chatId: number;
  readonly threadId: number | undefined;
};

type WorkQueue = Promise<void>;

type CachedSession = {
  readonly handle: ThreadHandle;
  readonly session: AgentSession;
  readonly promptRef: { wrapped: string | undefined };
  unsubscribe: () => void;
  lastUsed: number;
  lastTurnCost: number;
};

const LRU_CAP = 16;
const MAIN = "main";

export class SessionRegistry {
  private readonly config: TelegramConfig;
  private readonly api: Api;
  private readonly scheduler: Scheduler;
  private readonly workQueues = new Map<SessionKey, WorkQueue>();
  private readonly sessionCache = new Map<SessionKey, CachedSession>();
  private readonly authStorage: AuthStorage;
  private readonly modelRegistry: ModelRegistry;
  private readonly settingsManagers = new Map<string, SettingsManager>();
  private readonly agentDir: string;
  private state: TelegramState;
  private stateLoaded = false;
  private initPromise: Promise<void> | undefined;

  public constructor(config: TelegramConfig, api: Api, scheduler: Scheduler) {
    this.config = config;
    this.api = api;
    this.scheduler = scheduler;
    this.agentDir = getAgentDir();
    this.authStorage = AuthStorage.create(join(this.agentDir, "auth.json"));
    this.modelRegistry = ModelRegistry.create(
      this.authStorage,
      join(this.agentDir, "models.json")
    );
    this.state = { threads: {} };
  }

  public static key(handle: ThreadHandle): SessionKey {
    return `${handle.chatId}-${handle.threadId ?? MAIN}`;
  }

  public static parseKey(key: SessionKey): ThreadHandle {
    const idx = key.lastIndexOf("-");
    const chatId = Number(key.slice(0, idx));
    const tail = key.slice(idx + 1);
    return {
      chatId,
      threadId: tail === MAIN ? undefined : Number(tail),
    };
  }

  public async init(): Promise<void> {
    if (this.stateLoaded) {
      return;
    }
    this.initPromise ??= this.loadInitialState().catch((err: unknown) => {
      this.initPromise = undefined;
      throw err;
    });
    await this.initPromise;
  }

  private async loadInitialState(): Promise<void> {
    const loaded = await loadState(this.config.configDir);
    this.state = { threads: { ...loaded.threads } };
    await mkdir(join(this.config.configDir, "sessions"), { recursive: true });
    await mkdir(join(this.config.configDir, "instructions"), {
      recursive: true,
    });
    this.stateLoaded = true;
  }

  private requireInitialized(): void {
    if (!this.stateLoaded) {
      throw new Error("SessionRegistry.init() must complete before use");
    }
  }

  public enqueueMessage(
    handle: ThreadHandle,
    work: (session: AgentSession) => Promise<void>
  ): Promise<void> {
    this.requireInitialized();
    return this.enqueueWork(SessionRegistry.key(handle), async () => {
      const session = await this.loadSession(handle);
      await work(session);
    });
  }

  public enqueueCommand(
    handle: ThreadHandle,
    work: () => Promise<void>
  ): Promise<void> {
    this.requireInitialized();
    return this.enqueueWork(SessionRegistry.key(handle), work);
  }

  public getCachedSession(handle: ThreadHandle): AgentSession | undefined {
    return this.sessionCache.get(SessionRegistry.key(handle))?.session;
  }

  private enqueueWork(
    key: SessionKey,
    runner: () => Promise<void>
  ): Promise<void> {
    const prev = this.workQueues.get(key) ?? Promise.resolve();
    const next = prev.then(runner);
    const tail = next.catch((err: unknown) => {
      console.error(`[registry] tail error for key=${key}:`, err);
    });
    this.workQueues.set(key, tail);
    void tail.finally(() => {
      if (this.workQueues.get(key) === tail) {
        this.workQueues.delete(key);
      }
    });
    return next;
  }

  public getThreadSettings(handle: ThreadHandle): ThreadSettings {
    this.requireInitialized();
    return this.state.threads[SessionRegistry.key(handle)] ?? {};
  }

  public isStreaming(handle: ThreadHandle): boolean {
    return (
      this.sessionCache.get(SessionRegistry.key(handle))?.session.isStreaming ??
      false
    );
  }

  public async cancel(handle: ThreadHandle): Promise<boolean> {
    const cached = this.sessionCache.get(SessionRegistry.key(handle));
    if (!cached || !cached.session.isStreaming) {
      return false;
    }
    await cached.session.abort();
    return true;
  }

  public async setThreadCwd(
    handle: ThreadHandle,
    newCwd: string
  ): Promise<
    { readonly ok: true } | { readonly ok: false; readonly error: string }
  > {
    this.requireInitialized();
    try {
      const st = await stat(newCwd);
      if (!st.isDirectory()) {
        return { ok: false, error: `not a directory: ${newCwd}` };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, error: `path does not exist: ${newCwd}` };
      }
      return { ok: false, error: `stat failed: ${(err as Error).message}` };
    }
    const key = SessionRegistry.key(handle);
    await this.tearDownSession(key);
    await this.persistThreadSettings(key, {
      cwd: newCwd,
      sessionPath: undefined,
    });
    return { ok: true };
  }

  public async setThreadModel(
    handle: ThreadHandle,
    pattern: string
  ): Promise<
    | { readonly ok: true; readonly id: string }
    | {
        readonly ok: false;
        readonly kind: "none" | "ambiguous";
        readonly candidates: readonly string[];
      }
  > {
    this.requireInitialized();
    const result = resolveModel(this.modelRegistry, pattern);
    if (result.kind === "none" || result.kind === "ambiguous") {
      return {
        ok: false,
        kind: result.kind,
        candidates: result.candidates,
      };
    }
    const id = modelId(result.model);
    const key = SessionRegistry.key(handle);
    if (this.state.threads[key]?.model === id) {
      return { ok: true, id };
    }
    await this.persistThreadSettings(key, { model: id });
    const cached = this.sessionCache.get(key);
    if (cached) {
      await cached.session.setModel(result.model);
    }
    return { ok: true, id };
  }

  public getSupportedThinkingLevels(
    handle: ThreadHandle
  ): readonly ThinkingLevelOpt[] {
    this.requireInitialized();
    const settings = this.state.threads[SessionRegistry.key(handle)] ?? {};
    const mid = settings.model ?? this.config.model;
    if (!mid) {
      return [];
    }
    const resolved = resolveModel(this.modelRegistry, mid);
    if (resolved.kind !== "ok") {
      return [];
    }
    return piGetSupportedThinkingLevels(resolved.model) as ThinkingLevelOpt[];
  }

  public async setThreadThinkingLevel(
    handle: ThreadHandle,
    level: ThinkingLevelOpt
  ): Promise<void> {
    this.requireInitialized();
    const key = SessionRegistry.key(handle);
    if (this.state.threads[key]?.thinkingLevel === level) {
      return;
    }
    await this.persistThreadSettings(key, { thinkingLevel: level });
    const cached = this.sessionCache.get(key);
    if (cached) {
      cached.session.setThinkingLevel(level as ThinkingLevel);
    }
  }

  public async setThreadLogsMode(
    handle: ThreadHandle,
    logsMode: LogsMode
  ): Promise<void> {
    this.requireInitialized();
    const key = SessionRegistry.key(handle);
    if (this.state.threads[key]?.logsMode === logsMode) {
      return;
    }
    await this.persistThreadSettings(key, { logsMode });
  }

  public async steerIfStreaming(
    handle: ThreadHandle,
    text: string,
    options: Pick<PromptOptions, "images">
  ): Promise<boolean> {
    const cached = this.sessionCache.get(SessionRegistry.key(handle));
    if (!cached?.session.isStreaming) {
      return false;
    }
    await cached.session.prompt(text, {
      ...options,
      streamingBehavior: "steer",
      source: "rpc",
    });
    return true;
  }

  public async clearThread(handle: ThreadHandle): Promise<void> {
    this.requireInitialized();
    const key = SessionRegistry.key(handle);
    await this.tearDownSession(key);
    await this.persistThreadSettings(key, { sessionPath: undefined });
  }

  public async disposeAll(): Promise<void> {
    const pending = Array.from(this.workQueues.values()).map((p) =>
      p.catch(() => {})
    );
    await Promise.all(pending);
    for (const cached of this.sessionCache.values()) {
      cached.unsubscribe();
      cached.session.dispose();
    }
    this.sessionCache.clear();
    this.workQueues.clear();
    if (this.stateLoaded) {
      await this.flushState();
    }
  }

  private defaultSessionPath(key: SessionKey): string {
    return join(this.config.configDir, "sessions", `${key}.jsonl`);
  }

  private async persistThreadSettings(
    key: SessionKey,
    patch: Partial<ThreadSettings>
  ): Promise<void> {
    this.requireInitialized();
    const prev = this.state.threads[key] ?? {};
    this.state.threads[key] = { ...prev, ...patch };
    await this.flushState();
  }

  private async flushState(): Promise<void> {
    try {
      await saveStateAtomic(this.config.configDir, this.state);
    } catch (err) {
      console.warn(`[registry] state save failed:`, err);
    }
  }

  private async tearDownSession(key: SessionKey): Promise<void> {
    const cached = this.sessionCache.get(key);
    if (cached) {
      cached.unsubscribe();
      cached.session.dispose();
      this.sessionCache.delete(key);
    }
    const prev = this.state.threads[key];
    const path = prev?.sessionPath ?? this.defaultSessionPath(key);
    const archived = `${path}.archived-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    try {
      await rename(path, archived);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[registry] archive ${path}:`, err);
      }
    }
  }

  private async loadSession(handle: ThreadHandle): Promise<AgentSession> {
    this.requireInitialized();
    const key = SessionRegistry.key(handle);
    const cached = this.sessionCache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      const wrapped = await loadWrappedThreadInstruction({
        configDir: this.config.configDir,
        chatId: handle.chatId,
        threadId: handle.threadId,
      });
      if (cached.promptRef.wrapped !== wrapped) {
        cached.promptRef.wrapped = wrapped;
        await cached.session.reload();
      }
      return cached.session;
    }

    this.evictIfNeeded();

    const settings = this.state.threads[key] ?? {};
    const sessionPath = settings.sessionPath ?? this.defaultSessionPath(key);
    const { session, cwd, promptRef } = await this.buildAgentSession(
      handle,
      sessionPath
    );

    const entry: CachedSession = {
      handle,
      session,
      promptRef,
      unsubscribe: () => {},
      lastUsed: Date.now(),
      lastTurnCost: session.getSessionStats().cost ?? 0,
    };
    entry.unsubscribe = session.subscribe((event) => {
      if (event.type !== "turn_end") {
        return;
      }
      const total = session.getSessionStats().cost ?? 0;
      const delta = total - entry.lastTurnCost;
      if (delta <= 0) {
        return;
      }
      entry.lastTurnCost = total;
      const prevSettings = this.state.threads[key] ?? {};
      this.state.threads[key] = {
        ...prevSettings,
        cumulativeCost: (prevSettings.cumulativeCost ?? 0) + delta,
      };
      void this.flushState();
    });
    this.sessionCache.set(key, entry);

    await this.persistThreadSettings(key, { cwd, sessionPath });

    return session;
  }

  private async buildAgentSession(
    handle: ThreadHandle,
    sessionPath: string
  ): Promise<{
    readonly session: AgentSession;
    readonly cwd: string;
    readonly promptRef: { wrapped: string | undefined };
  }> {
    const key = SessionRegistry.key(handle);
    const settings = this.state.threads[key] ?? {};
    const cwd = settings.cwd ?? this.config.cwd;
    const sessionManager = SessionManager.open(sessionPath, undefined, cwd);
    const settingsManager = this.settingsManagerFor(cwd);
    const wrapped = await loadWrappedThreadInstruction({
      configDir: this.config.configDir,
      chatId: handle.chatId,
      threadId: handle.threadId,
    });
    const promptRef = { wrapped };

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      settingsManager,
      appendSystemPromptOverride: (base) => {
        return promptRef.wrapped ? [...base, promptRef.wrapped] : base;
      },
    });
    await loader.reload();

    const defaultModelId = settings.model ?? this.config.model;
    let model;
    if (defaultModelId) {
      const resolved = resolveModel(this.modelRegistry, defaultModelId);
      if (resolved.kind === "ok") {
        model = resolved.model;
      } else {
        console.warn(
          `[registry] model "${defaultModelId}" did not resolve cleanly (${resolved.kind})`
        );
      }
    }

    const sendFile = buildSendFileTool({ api: this.api, handle, cwd });
    const taskTool = buildTaskTool({ scheduler: this.scheduler, handle });

    const { session } = await createAgentSession({
      cwd,
      agentDir: this.agentDir,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager,
      resourceLoader: loader,
      sessionManager,
      model,
      thinkingLevel: settings.thinkingLevel as ThinkingLevel | undefined,
      customTools: [sendFile, taskTool],
    });

    return { session, cwd, promptRef };
  }

  public enqueueIsolatedMessage(
    handle: ThreadHandle,
    work: (session: AgentSession) => Promise<void>
  ): Promise<void> {
    this.requireInitialized();
    const key = SessionRegistry.key(handle);
    return this.enqueueWork(key, async () => {
      const sessionPath = this.isolatedSessionPath(key);
      await mkdir(dirname(sessionPath), { recursive: true });
      const { session } = await this.buildAgentSession(handle, sessionPath);
      try {
        await work(session);
      } finally {
        session.dispose();
      }
    });
  }

  private isolatedSessionPath(key: SessionKey): string {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return join(this.config.configDir, "tasks-sessions", `${key}-${ts}.jsonl`);
  }

  private settingsManagerFor(cwd: string): SettingsManager {
    const existing = this.settingsManagers.get(cwd);
    if (existing) {
      return existing;
    }
    const settingsManager = SettingsManager.create(cwd, this.agentDir);
    this.settingsManagers.set(cwd, settingsManager);
    return settingsManager;
  }

  private evictIfNeeded(): void {
    if (this.sessionCache.size < LRU_CAP) {
      return;
    }
    let oldestKey: SessionKey | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of this.sessionCache) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldestKey = k;
      }
    }
    if (!oldestKey) {
      return;
    }
    const entry = this.sessionCache.get(oldestKey)!;
    entry.unsubscribe();
    entry.session.dispose();
    this.sessionCache.delete(oldestKey);
  }
}
