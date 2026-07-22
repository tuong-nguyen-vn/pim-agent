import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AgentSessionEvent,
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  Model,
  TextContent,
  Usage,
} from "@earendil-works/pi-ai";
import { type AgentConfig, discoverAgents } from "./agents";
import { formatTopLine } from "./render";

export const PER_TASK_OUTPUT_CAP = 32 * 1024;
export const SUBAGENT_TOOL_NAME = "subagent";

const inSubagent = new AsyncLocalStorage<true>();

export type SubagentUsage = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly cost: number;
  readonly turns: number;
  readonly contextTokens: number | undefined;
};

export type SubagentToolCall = {
  readonly name: string;
  readonly isError: boolean;
};

export type SubagentDetails = {
  readonly returnedOutput: string;
  readonly fullOutput: string;
  readonly outputTruncated: boolean;
  readonly omittedBytes: number;
  readonly usage: SubagentUsage;
  readonly toolCalls: readonly SubagentToolCall[];
  readonly activeToolNames: readonly string[];
  readonly lastToolName: string | undefined;
  readonly stopReason: string | undefined;
  readonly errorMessage: string | undefined;
  readonly model: string | undefined;
  readonly contextWindow: number | undefined;
  readonly topLine: string;
};

export type SubagentSnapshot = {
  readonly finalOutput: string;
  readonly usage: SubagentUsage;
  readonly toolCalls: readonly SubagentToolCall[];
  readonly activeToolNames: readonly string[];
  readonly lastToolName: string | undefined;
  readonly stopReason: string | undefined;
  readonly errorMessage: string | undefined;
  readonly model: string | undefined;
  readonly contextWindow: number | undefined;
};

export type SubagentSession = {
  readonly subscribe: (
    listener: (event: AgentSessionEvent) => void
  ) => () => void;
  readonly prompt: (prompt: string) => Promise<void>;
  readonly abort: () => Promise<void>;
  readonly dispose: () => void;
};

export type CreateSubagentSession = (
  parentCtx: ExtensionContext,
  activeToolNames: readonly string[] | undefined,
  agent: AgentConfig | undefined,
  model: Model<any> | undefined
) => Promise<SubagentSession>;

export function childToolNames(
  activeToolNames: readonly string[]
): readonly string[] {
  return activeToolNames.filter((name) => name !== SUBAGENT_TOOL_NAME);
}

export async function createSdkSubagentSession(
  parentCtx: ExtensionContext,
  activeToolNames: readonly string[] | undefined,
  agent: AgentConfig | undefined,
  model: Model<any> | undefined
): Promise<SubagentSession> {
  const systemPrompt = agent?.systemPrompt.trim();
  const loader = new DefaultResourceLoader({
    cwd: parentCtx.cwd,
    agentDir: getAgentDir(),
    appendSystemPrompt: systemPrompt ? [systemPrompt] : undefined,
  });
  await loader.reload();

  const baseTools = agent?.tools ?? activeToolNames;

  const { session } = await createAgentSession({
    cwd: parentCtx.cwd,
    agentDir: getAgentDir(),
    model,
    sessionManager: SessionManager.inMemory(parentCtx.cwd),
    resourceLoader: loader,
    tools: baseTools ? [...childToolNames(baseTools)] : undefined,
  });

  return session;
}

export function resolveSubagentModel(
  parentCtx: ExtensionContext,
  agent: AgentConfig | undefined
): Model<any> | undefined {
  const reference = agent?.model?.trim();
  if (!reference) {
    return parentCtx.model;
  }

  const normalized = reference.toLowerCase();
  const agentLabel = agent?.name ?? "configured";
  const models = parentCtx.modelRegistry.getAll();
  const canonical = models.filter(
    (model) => `${model.provider}/${model.id}`.toLowerCase() === normalized
  );
  if (canonical.length === 1) {
    return canonical[0];
  }

  const byId = models.filter((model) => model.id.toLowerCase() === normalized);
  if (byId.length === 1) {
    return byId[0];
  }
  if (byId.length > 1) {
    const authenticated = byId.filter((model) =>
      parentCtx.modelRegistry.hasConfiguredAuth(model)
    );
    if (authenticated.length === 1) {
      return authenticated[0];
    }
    throw new Error(
      `Ambiguous model "${reference}" for subagent "${agentLabel}". Use provider/model.`
    );
  }
  throw new Error(
    `Unknown model "${reference}" for subagent "${agentLabel}". Use an exact model id or provider/model.`
  );
}

function resolveAgent(
  agentName: string,
  agents: readonly AgentConfig[]
): AgentConfig {
  const normalized = agentName.trim().toLowerCase();
  const agent = agents.find((a) => a.name.toLowerCase() === normalized);
  if (agent) {
    return agent;
  }
  const available =
    agents.map((a) => `${a.name} (${a.source})`).join(", ") ||
    "none configured";
  throw new Error(`Unknown subagent "${agentName}". Available: ${available}.`);
}

function promptFor(prompt: string, agent: AgentConfig | undefined): string {
  return agent ? `Task: ${prompt}` : prompt;
}

export async function runSubagent(
  prompt: string,
  parentCtx: ExtensionContext,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<SubagentDetails>,
  createSession: CreateSubagentSession = createSdkSubagentSession,
  activeToolNames?: readonly string[],
  agentName?: string
): Promise<AgentToolResult<SubagentDetails>> {
  // Hard block against subagent recursion
  if (inSubagent.getStore()) {
    throw new Error("subagents cannot call subagent tool");
  }

  return inSubagent.run(true, async () => {
    const agent = agentName
      ? resolveAgent(agentName, await discoverAgents(parentCtx.cwd))
      : undefined;
    const model = resolveSubagentModel(parentCtx, agent);

    const capture = new SubagentEventCapture(onUpdate, {
      contextWindow: model?.contextWindow,
      model: model?.id,
    });
    let session: SubagentSession | undefined;
    let thrown: unknown;
    let abortRequested = false;
    let abortPromise: Promise<void> | undefined;
    let unsubscribe: (() => void) | undefined;

    const ensureAbort = (): Promise<void> => {
      if (!session) {
        return Promise.resolve();
      }
      abortPromise ??= session.abort().catch(() => {});
      return abortPromise;
    };

    const onAbort = () => {
      abortRequested = true;
      void ensureAbort();
    };

    try {
      if (signal?.aborted) {
        abortRequested = true;
        throw new Error("subagent aborted before start");
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      session = await createSession(parentCtx, activeToolNames, agent, model);
      unsubscribe = session.subscribe((event) => capture.handle(event));
      if (abortRequested) {
        await ensureAbort();
        throw new Error("subagent aborted before start");
      }
      await session.prompt(promptFor(prompt, agent));
      if (abortRequested && capture.snapshot().stopReason !== "aborted") {
        capture.markAborted();
      }
    } catch (err) {
      thrown = err;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      if (abortRequested) {
        await ensureAbort();
      }
      unsubscribe?.();
      session?.dispose();
    }

    const snapshot = capture.snapshot();
    if (thrown !== undefined) {
      throw makeFailureError(
        thrownMessage(thrown),
        undefined,
        snapshot.finalOutput
      );
    }
    if (snapshot.stopReason === "error" || snapshot.stopReason === "aborted") {
      throw makeFailureError(
        snapshot.stopReason,
        snapshot.errorMessage,
        snapshot.finalOutput
      );
    }

    const details = capture.details();
    const text =
      details.returnedOutput ||
      "[subagent tool: completed with no text output.]";
    return {
      content: [{ type: "text", text }],
      details,
    };
  });
}

export class SubagentEventCapture {
  private finalOutput = "";
  private pendingMessage: AssistantMessage | undefined;
  private readonly usage: MutableUsage = emptyUsage();
  private readonly toolCalls: SubagentToolCall[] = [];
  private readonly activeToolsById = new Map<string, string>();
  private lastToolName: string | undefined;
  private stopReason: string | undefined;
  private errorMessage: string | undefined;
  private model: string | undefined;

  public constructor(
    private readonly onUpdate?: AgentToolUpdateCallback<SubagentDetails>,
    private readonly options: {
      readonly contextWindow?: number;
      readonly model?: string;
    } = {}
  ) {
    this.model = options.model;
  }

  public handle(event: AgentSessionEvent): void {
    if (event.type === "message_start" && isAssistantMessage(event.message)) {
      this.finalOutput = "";
      this.pendingMessage = undefined;
      this.emitUpdate();
      return;
    }

    if (event.type === "message_update" && isAssistantMessage(event.message)) {
      this.pendingMessage = event.message;
      return;
    }

    if (event.type === "message_end" && isAssistantMessage(event.message)) {
      this.pendingMessage = undefined;
      this.finalOutput = collectText(event.message);
      addUsage(this.usage, event.message.usage);
      this.usage.turns += 1;
      this.stopReason = event.message.stopReason;
      this.errorMessage = event.message.errorMessage;
      this.model = event.message.model;
      this.emitUpdate();
      return;
    }

    if (event.type === "tool_execution_start") {
      this.activeToolsById.set(event.toolCallId, event.toolName);
      this.lastToolName = event.toolName;
      this.emitUpdate();
      return;
    }

    if (event.type === "tool_execution_end") {
      this.activeToolsById.delete(event.toolCallId);
      this.toolCalls.push({ name: event.toolName, isError: event.isError });
      this.lastToolName = event.toolName;
      this.emitUpdate();
    }
  }

  public markAborted(): void {
    this.stopReason = "aborted";
    this.emitUpdate();
  }

  public snapshot(): SubagentSnapshot {
    this.materializePending();
    return {
      finalOutput: this.finalOutput,
      usage: freezeUsage(this.usage),
      toolCalls: [...this.toolCalls],
      activeToolNames: Array.from(new Set(this.activeToolsById.values())),
      lastToolName: this.lastToolName,
      stopReason: this.stopReason,
      errorMessage: this.errorMessage,
      model: this.model,
      contextWindow: this.options.contextWindow,
    };
  }

  public details(): SubagentDetails {
    const snapshot = this.snapshot();
    const cap = applyOutputCap(snapshot.finalOutput);
    return detailsFromSnapshot(snapshot, cap.text, cap);
  }

  private materializePending(): void {
    if (this.pendingMessage) {
      this.finalOutput = collectText(this.pendingMessage);
      this.pendingMessage = undefined;
    }
  }

  private emitUpdate(): void {
    if (!this.onUpdate) {
      return;
    }
    const details = this.details();
    this.onUpdate({
      content: [{ type: "text", text: details.topLine }],
      details,
    });
  }
}

type MutableUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
  contextTokens: number | undefined;
};

export type OutputCapResult = {
  readonly text: string;
  readonly truncated: boolean;
  readonly omittedBytes: number;
};

export function applyOutputCap(
  text: string,
  capBytes = PER_TASK_OUTPUT_CAP
): OutputCapResult {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(text).byteLength;
  if (totalBytes <= capBytes) {
    return { text, truncated: false, omittedBytes: 0 };
  }

  const buffer = new Uint8Array(capBytes);
  const { read, written } = encoder.encodeInto(text, buffer);
  const out = text.slice(0, read);
  const omittedBytes = totalBytes - written;
  return {
    text: `${out}\n[subagent: output truncated, ${omittedBytes} bytes omitted; full output preserved in tool details.]`,
    truncated: true,
    omittedBytes,
  };
}

function makeFailureError(
  reason: string,
  errorMessage: string | undefined,
  partialOutput: string
): Error {
  const capped = applyOutputCap(partialOutput);
  return new Error(
    `Subagent failed: ${reason}. Error: ${errorMessage ?? "none"}.\n` +
      `Partial output before failure:\n${capped.text}`
  );
}

function detailsFromSnapshot(
  snapshot: SubagentSnapshot,
  returnedOutput: string,
  capResult: OutputCapResult
): SubagentDetails {
  return {
    returnedOutput,
    fullOutput: snapshot.finalOutput,
    outputTruncated: capResult.truncated,
    omittedBytes: capResult.omittedBytes,
    usage: snapshot.usage,
    toolCalls: snapshot.toolCalls,
    activeToolNames: snapshot.activeToolNames,
    lastToolName: snapshot.lastToolName,
    stopReason: snapshot.stopReason,
    errorMessage: snapshot.errorMessage,
    model: snapshot.model,
    contextWindow: snapshot.contextWindow,
    topLine: formatTopLine(snapshot),
  };
}

function collectText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    message.role === "assistant" &&
    "content" in message &&
    Array.isArray(message.content)
  );
}

function emptyUsage(): MutableUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    turns: 0,
    contextTokens: undefined,
  };
}

function freezeUsage(usage: MutableUsage): SubagentUsage {
  return { ...usage };
}

function addUsage(target: MutableUsage, usage: Usage): void {
  target.input += usage.input;
  target.output += usage.output;
  target.cacheRead += usage.cacheRead;
  target.cacheWrite += usage.cacheWrite;
  target.cost += usage.cost.total;
  target.contextTokens = usage.totalTokens || target.contextTokens;
}

function thrownMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
