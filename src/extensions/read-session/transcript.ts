import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const TRANSCRIPT_MAX_CHARS = 120_000;
export const TRANSCRIPT_BLOCK_MAX_CHARS = 12_000;

const MIDDLE_OMISSION =
  "\n\n[... middle of session omitted to fit the summarizer context ...]\n\n";
const BLOCK_OMISSION = "\n[... block truncated ...]";

type TranscriptResult = {
  readonly text: string;
  readonly truncated: boolean;
};

function truncateBlock(text: string): {
  readonly text: string;
  readonly truncated: boolean;
} {
  if (text.length <= TRANSCRIPT_BLOCK_MAX_CHARS) {
    return { text, truncated: false };
  }
  const room = TRANSCRIPT_BLOCK_MAX_CHARS - BLOCK_OMISSION.length;
  const head = Math.floor(room * 0.6);
  const tail = room - head;
  return {
    text: text.slice(0, head) + BLOCK_OMISSION + text.slice(-tail),
    truncated: true,
  };
}

function textContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typed = block as Record<string, unknown>;
    if (typed["type"] === "text" && typeof typed["text"] === "string") {
      parts.push(typed["text"]);
    } else if (typed["type"] === "image") {
      parts.push("[image omitted]");
    } else if (typed["type"] === "toolCall") {
      const name =
        typeof typed["name"] === "string" ? typed["name"] : "unknown";
      let args = "{}";
      try {
        args = JSON.stringify(typed["arguments"] ?? {});
      } catch {}
      parts.push(`[tool call: ${name}] ${args}`);
    }
  }
  return parts.join("\n");
}

function messageBlock(message: AgentMessage): string | undefined {
  const role = message.role;
  if (role === "user" || role === "assistant") {
    const text = textContent(message.content);
    return text ? `[${role.toUpperCase()}]\n${text}` : undefined;
  }
  if (role === "toolResult") {
    const text = textContent(message.content);
    return text ? `[TOOL RESULT: ${message.toolName}]\n${text}` : undefined;
  }
  if (role === "bashExecution") {
    return `[BASH]\n$ ${message.command}\n${message.output}`;
  }
  if (role === "custom") {
    const text = textContent(message.content);
    return text ? `[CUSTOM: ${message.customType}]\n${text}` : undefined;
  }
  if (role === "branchSummary") {
    return `[BRANCH SUMMARY]\n${message.summary}`;
  }
  if (role === "compactionSummary") {
    return `[COMPACTION SUMMARY]\n${message.summary}`;
  }
  return undefined;
}

export function buildTranscript(
  messages: readonly AgentMessage[],
  maxChars = TRANSCRIPT_MAX_CHARS
): TranscriptResult {
  const blocks: string[] = [];
  let truncated = false;
  for (const message of messages) {
    const raw = messageBlock(message);
    if (!raw) {
      continue;
    }
    const block = truncateBlock(raw);
    blocks.push(block.text);
    truncated ||= block.truncated;
  }

  const full = blocks.join("\n\n");
  if (full.length <= maxChars) {
    return { text: full, truncated };
  }

  const room = Math.max(0, maxChars - MIDDLE_OMISSION.length);
  const headBudget = Math.floor(room * 0.45);
  const tailBudget = room - headBudget;
  const headParts: string[] = [];
  let headLength = 0;
  let headIndex = 0;
  while (headIndex < blocks.length && headLength < headBudget) {
    const separator = headParts.length === 0 ? 0 : 2;
    const remaining = headBudget - headLength - separator;
    if (remaining <= 0) {
      break;
    }
    const block = blocks[headIndex] ?? "";
    headParts.push(block.slice(0, remaining));
    headLength += Math.min(block.length, remaining) + separator;
    headIndex += 1;
  }

  const tailParts: string[] = [];
  let tailLength = 0;
  let tailIndex = blocks.length - 1;
  while (tailIndex >= headIndex && tailLength < tailBudget) {
    const separator = tailParts.length === 0 ? 0 : 2;
    const remaining = tailBudget - tailLength - separator;
    if (remaining <= 0) {
      break;
    }
    const block = blocks[tailIndex] ?? "";
    tailParts.unshift(
      block.length <= remaining
        ? block
        : block.slice(0, Math.floor(remaining * 0.4)) +
            "\n[... block truncated ...]\n" +
            block.slice(-Math.floor(remaining * 0.4))
    );
    tailLength += Math.min(block.length, remaining) + separator;
    tailIndex -= 1;
  }
  return {
    text: headParts.join("\n\n") + MIDDLE_OMISSION + tailParts.join("\n\n"),
    truncated: true,
  };
}
