import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Paths } from "../../shared/Paths";
import {
  Renderer,
  type StatefulToolCallTitleContext,
} from "../../shared/Renderer";
import { SpillCache } from "../../shared/SpillCache";
import { Tools } from "../../shared/Tools";
import { detailsOf, formatResult, isErrorResult } from "./format";
import { killAllActiveBashGroups, runBashCommand } from "./run";
import { type BashInput, bashSchema, DEFAULT_TIMEOUT_MS } from "./schema";

const PREVIEW_LINES = 5;

type BashRenderContext = StatefulToolCallTitleContext & {
  readonly args?: Partial<BashInput>;
  readonly cwd: string;
};

function renderTitle(
  args: Partial<BashInput> | undefined,
  theme: Parameters<typeof Renderer.renderStatefulToolCallTitle>[0]["theme"],
  context: BashRenderContext
) {
  const command =
    typeof args?.command === "string" && args.command ? args.command : "...";
  const title = `${command}${Paths.cwdSuffix(args?.cwd, context.cwd)}`;
  return Renderer.renderStatefulToolCallTitle({
    label: "",
    title,
    theme,
    context,
    markerGlyph: "$",
    separator: "",
    pad: false,
    useSpinner: true,
  });
}

function previewResult(
  result: AgentToolResult<unknown>,
  isError: boolean
): AgentToolResult<unknown> {
  if (isError) {
    return result;
  }

  const first = result.content?.[0];
  if (!first || !("text" in first)) {
    return result;
  }

  const lines = (first.text ?? "").split("\n");
  if (lines[0] === "Exit code: 0") {
    lines.shift();
  }
  if (lines[0] === "stdout:" || lines[0] === "stderr:") {
    lines.shift();
  }

  return {
    ...result,
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

let lifecycleHandlersInstalled = false;

function installLifecycleHandlers(): void {
  if (lifecycleHandlersInstalled) {
    return;
  }
  lifecycleHandlersInstalled = true;

  // Sweep bash subtrees that escaped our process group (double-forked
  // daemons in their own session) or that the parent harness is about to
  // strand by signalling us. Re-raise the signal so the default handler
  // still runs.
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.once(sig, () => {
      try {
        killAllActiveBashGroups(sig);
      } catch {}
      process.kill(process.pid, sig);
    });
  }
}

export default function (pi: ExtensionAPI): void {
  SpillCache.installSweeper();
  installLifecycleHandlers();
  Tools.register(pi, {
    name: "bash",
    label: "bash",
    description:
      "Execute a bash command in the cwd. " +
      "Returns exit code, signal (if any), and stdout/stderr captured separately. " +
      "Prefer commands that emit only what you need; keep output as small as possible. " +
      "Pass `cwd` (an absolute path) to run in another directory instead of prefixing the command with `cd … &&`.",
    parameters: bashSchema,
    renderShell: "self",
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const {
        command,
        cwd,
        timeoutMs: requestedTimeoutMs,
      } = params as BashInput;
      const timeoutMs = requestedTimeoutMs ?? DEFAULT_TIMEOUT_MS;
      const effectiveCwd = cwd ? Paths.requireAbsolute(cwd) : ctx.cwd;

      if (signal?.aborted) {
        throw new Error("Command aborted before execution.");
      }

      const result = await runBashCommand(
        command,
        timeoutMs,
        signal,
        effectiveCwd
      );
      const text = formatResult(result, timeoutMs);
      if (isErrorResult(result)) {
        throw new Error(text);
      }
      return {
        content: [{ type: "text", text }],
        details: detailsOf(result),
      };
    },
    renderCall(args, theme, context) {
      return renderTitle(
        args as Partial<BashInput> | undefined,
        theme,
        context
      );
    },
    renderResult(result, options, theme, context) {
      renderTitle(context.args, theme, context);
      return Renderer.renderBorderedResult({
        result: previewResult(result, context.isError),
        options,
        theme,
        context,
        previewLines: PREVIEW_LINES,
        prefix: { prefix: "   ", width: 3 },
        showCollapsedSuccess: true,
        previewFromEnd: true,
      });
    },
  });
}
