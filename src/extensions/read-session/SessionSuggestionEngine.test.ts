import { expect, test } from "bun:test";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { SessionSuggestionEngine } from "./SessionSuggestionEngine";

const session = (
  id: string,
  name: string,
  firstMessage: string,
  modified: string
): SessionInfo => ({
  id,
  path: `/sessions/${id}.jsonl`,
  cwd: "/work",
  name,
  created: new Date(modified),
  modified: new Date(modified),
  messageCount: 4,
  firstMessage,
  allMessagesText: firstMessage,
});

test("session suggestions list recent workspace sessions and exclude current", async () => {
  const engine = new SessionSuggestionEngine(
    "/work",
    "/sessions",
    () => "current",
    async (cwd) => {
      expect(cwd).toBe("/work");
      return [
        session("older", "Old task", "first", "2026-01-01T00:00:00Z"),
        session("current", "Current", "current", "2026-01-03T00:00:00Z"),
        session("newer", "New task", "second", "2026-01-02T00:00:00Z"),
      ];
    }
  );

  const items = await engine.rank("", {
    limit: 20,
    signal: new AbortController().signal,
  });
  expect(items.map((item) => item.value)).toEqual([
    "@@session:newer",
    "@@session:older",
  ]);
});

test("session suggestions filter by name, first message, and ID", async () => {
  const engine = new SessionSuggestionEngine(
    "/work",
    "/sessions",
    () => "current",
    async () => [
      session(
        "auth-123",
        "Refresh tokens",
        "Fix concurrency race",
        "2026-01-02T00:00:00Z"
      ),
      session("ui-456", "Picker", "Add autocomplete", "2026-01-01T00:00:00Z"),
    ]
  );

  const byName = await engine.rank("refresh", { limit: 20 });
  expect(byName[0]?.value).toBe("@@session:auth-123");
  const byPrompt = await engine.rank("concurrency", { limit: 20 });
  expect(byPrompt[0]?.value).toBe("@@session:auth-123");
  const byId = await engine.rank("auth-", { limit: 20 });
  expect(byId[0]?.value).toBe("@@session:auth-123");
});
