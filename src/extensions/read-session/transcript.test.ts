import { expect, test } from "bun:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { buildTranscript } from "./transcript";

const message = (value: unknown): AgentMessage => value as AgentMessage;

test("buildTranscript keeps useful roles and omits thinking and image data", () => {
  const result = buildTranscript([
    message({ role: "user", content: [{ type: "text", text: "Fix auth" }] }),
    message({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "secret reasoning" },
        {
          type: "toolCall",
          id: "1",
          name: "grep",
          arguments: { pattern: "auth" },
        },
        { type: "text", text: "I found the issue." },
      ],
    }),
    message({
      role: "toolResult",
      toolName: "grep",
      content: [
        { type: "text", text: "src/auth.ts:10" },
        { type: "image", data: "base64-secret", mimeType: "image/png" },
      ],
    }),
    message({ role: "compactionSummary", summary: "Earlier work summary" }),
  ]);

  expect(result.text).toContain("[USER]\nFix auth");
  expect(result.text).toContain("[tool call: grep]");
  expect(result.text).toContain("[TOOL RESULT: grep]");
  expect(result.text).toContain("[image omitted]");
  expect(result.text).toContain("[COMPACTION SUMMARY]");
  expect(result.text).not.toContain("secret reasoning");
  expect(result.text).not.toContain("base64-secret");
});

test("buildTranscript preserves the beginning and end when globally truncated", () => {
  const result = buildTranscript(
    [
      message({ role: "user", content: "BEGIN " + "a".repeat(200) }),
      message({
        role: "assistant",
        content: [{ type: "text", text: "middle ".repeat(100) }],
      }),
      message({
        role: "assistant",
        content: [{ type: "text", text: "END " + "z".repeat(200) }],
      }),
    ],
    300
  );

  expect(result.truncated).toBe(true);
  expect(result.text).toContain("BEGIN");
  expect(result.text).toContain("END");
  expect(result.text).toContain("middle of session omitted");
});
