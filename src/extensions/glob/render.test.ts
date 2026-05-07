import { describe, expect, test } from "bun:test";
import type { GlobMatch } from "./glob";
import { formatTitle, renderFiles } from "./render";

const fixture: readonly GlobMatch[] = [
  { path: "/repo/newer.ts", mtime: 2_000 },
  { path: "/repo/older.ts", mtime: 1_000 },
];

describe("renderFiles", () => {
  test("joins paths with newlines, newest first", () => {
    const outcome = renderFiles(fixture, 1000);
    expect(outcome.body).toBe("/repo/newer.ts\n/repo/older.ts");
    expect(outcome.totalItems).toBe(2);
    expect(outcome.visibleItems).toBe(2);
    expect(outcome.truncated).toBe(false);
  });

  test("flips truncated when results exceed headLimit", () => {
    const outcome = renderFiles(fixture, 1);
    expect(outcome.body).toBe("/repo/newer.ts");
    expect(outcome.truncated).toBe(true);
    expect(outcome.visibleItems).toBe(1);
    expect(outcome.totalItems).toBe(2);
  });

  test("returns a no-match outcome when there are no results", () => {
    const outcome = renderFiles([], 1000);
    expect(outcome.body).toBe("No matches.");
    expect(outcome.truncated).toBe(false);
    expect(outcome.totalItems).toBe(0);
    expect(outcome.visibleItems).toBe(0);
  });
});

describe("formatTitle", () => {
  test("uses relative path under cwd", () => {
    const title = formatTitle({
      pattern: "**/*.ts",
      path: "/repo/src",
      cwd: "/repo",
    });
    expect(title).toBe("**/*.ts in src");
  });

  test("falls back to '.' when path is undefined", () => {
    const title = formatTitle({
      pattern: "**/*.ts",
      path: undefined,
      cwd: "/repo",
    });
    expect(title).toBe("**/*.ts in .");
  });

  test("uses '...' placeholder when pattern is undefined", () => {
    const title = formatTitle({
      pattern: undefined,
      path: undefined,
      cwd: "/repo",
    });
    expect(title).toBe("... in .");
  });
});
