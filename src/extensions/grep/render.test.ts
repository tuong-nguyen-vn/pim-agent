import { describe, expect, test } from "bun:test";
import type { GrepMatch } from "./grep";
import { formatTitle, renderMatches } from "./render";

const fixture: readonly GrepMatch[] = [
  {
    filePath: "/repo/older.ts",
    mtime: 1_000,
    lines: [{ lineNumber: 1, text: "alpha" }],
  },
  {
    filePath: "/repo/newer.ts",
    mtime: 2_000,
    lines: [
      { lineNumber: 2, text: "alpha" },
      { lineNumber: 5, text: "alphabet" },
    ],
  },
];

describe("renderMatches", () => {
  test("files_with_matches sorts by recency desc", () => {
    const outcome = renderMatches(fixture, "files_with_matches", 1000);
    expect(outcome.body).toBe("/repo/newer.ts\n/repo/older.ts");
    expect(outcome.fileCount).toBe(2);
    expect(outcome.totalMatches).toBe(3);
    expect(outcome.totalItems).toBe(2);
    expect(outcome.truncated).toBe(false);
  });

  test("content emits path:line:text lines, recency-sorted", () => {
    const outcome = renderMatches(fixture, "content", 1000);
    expect(outcome.body).toBe(
      [
        "/repo/newer.ts:2:alpha",
        "/repo/newer.ts:5:alphabet",
        "/repo/older.ts:1:alpha",
      ].join("\n")
    );
    expect(outcome.totalItems).toBe(3);
  });

  test("count sorts by match count desc, then mtime desc, then path asc", () => {
    const outcome = renderMatches(fixture, "count", 1000);
    expect(outcome.body).toBe("/repo/newer.ts:2\n/repo/older.ts:1");
  });

  test("flags truncation when results exceed headLimit", () => {
    const outcome = renderMatches(fixture, "content", 2);
    expect(outcome.body).toBe(
      "/repo/newer.ts:2:alpha\n/repo/newer.ts:5:alphabet"
    );
    expect(outcome.truncated).toBe(true);
    expect(outcome.visibleItems).toBe(2);
    expect(outcome.totalItems).toBe(3);
  });

  test("returns a no-match outcome when there are no results", () => {
    const outcome = renderMatches([], "content", 1000);
    expect(outcome.body).toBe("No matches.");
    expect(outcome.truncated).toBe(false);
    expect(outcome.fileCount).toBe(0);
    expect(outcome.totalMatches).toBe(0);
  });
});

describe("formatTitle", () => {
  test("uses relative path under cwd and includes glob and mode", () => {
    const title = formatTitle({
      pattern: "alpha",
      path: "/repo/src",
      glob: "**/*.ts",
      outputMode: "content",
      cwd: "/repo",
    });
    expect(title).toBe("/alpha/ in src **/*.ts (content)");
  });

  test("falls back to '.' when path is omitted", () => {
    const title = formatTitle({
      pattern: "alpha",
      path: undefined,
      glob: undefined,
      outputMode: "files_with_matches",
      cwd: "/repo",
    });
    expect(title).toBe("/alpha/ in . (files_with_matches)");
  });
});
