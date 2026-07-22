import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Tools } from "../../shared/Tools";
import { renderCall, renderResult } from "./render";
import { subagentSchema, type SubagentInput } from "./schema";
import { runSubagent, type SubagentDetails } from "./subagent";

export default function (pi: ExtensionAPI): void {
  Tools.register<typeof subagentSchema, SubagentDetails>(pi, {
    name: "subagent",
    label: "subagent",
    description:
      "Run a task in an isolated subagent with a fresh context. " +
      "The subagent inherits the currently active tools, except subagent itself. " +
      "Multiple subagent calls in one turn run in parallel. " +
      "Subagent output returned to the main agent is capped at 32KB. " +
      `Set "agent" to the name of a predefined agent from ${join(getAgentDir(), "agents")} ` +
      "(or the project's .pi/agents) to use its configured name, model, system prompt, and tools. " +
      'Use agent="Search" for broad code discovery and agent="Oracle" for deep reasoning; omit agent only for a plain subagent that should inherit the current model.',
    parameters: subagentSchema,
    renderShell: "self",
    executionMode: "parallel",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as SubagentInput;
      return runSubagent(
        input.prompt,
        ctx,
        signal,
        onUpdate,
        undefined,
        pi.getActiveTools(),
        input.agent
      );
    },
    renderCall,
    renderResult,
  });
}
