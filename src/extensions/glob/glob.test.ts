import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { findFiles } from "./glob";

const tempRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), "pim-glob-tool-"));

describe("findFiles", () => {
  test("sorts by recency desc with path-asc tiebreak when mtimes are equal", async () => {
    const root = await tempRoot();
    const older = join(root, "older.ts");
    const tieB = join(root, "b.ts");
    const tieA = join(root, "a.ts");

    await writeFile(older, "", "utf8");
    await writeFile(tieA, "", "utf8");
    await writeFile(tieB, "", "utf8");

    await utimes(
      older,
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-01-01T00:00:00Z")
    );
    await utimes(
      tieA,
      new Date("2024-01-02T00:00:00Z"),
      new Date("2024-01-02T00:00:00Z")
    );
    await utimes(
      tieB,
      new Date("2024-01-02T00:00:00Z"),
      new Date("2024-01-02T00:00:00Z")
    );

    const matches = await findFiles(root, "**/*.ts");

    expect(matches.map((match) => match.path)).toEqual([tieA, tieB, older]);
  });

  test("respects gitignore, dotfiles, and the always-ignored defaults", async () => {
    const root = await tempRoot();
    const src = join(root, "src");
    const ignored = join(src, "ignored.ts");
    const kept = join(src, "kept.ts");
    const nodeModules = join(root, "node_modules", "pkg", "x.ts");
    const dot = join(root, ".secret", "x.ts");

    await mkdir(src, { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, ".secret"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "ignored.ts\n", "utf8");
    await writeFile(ignored, "", "utf8");
    await writeFile(kept, "", "utf8");
    await writeFile(nodeModules, "", "utf8");
    await writeFile(dot, "", "utf8");

    const matches = await findFiles(root, "**/*.ts");

    expect(matches.map((match) => match.path)).toEqual([kept]);
  });

  test("filters by glob pattern extension", async () => {
    const root = await tempRoot();
    const ts = join(root, "a.ts");
    const md = join(root, "a.md");

    await writeFile(ts, "", "utf8");
    await writeFile(md, "", "utf8");

    const matches = await findFiles(root, "**/*.ts");

    expect(matches.map((match) => match.path)).toEqual([ts]);
  });

  test("throws an actionable error when the path does not exist", async () => {
    const root = await tempRoot();
    const missing = join(root, "nope");

    await expect(findFiles(missing, "**/*")).rejects.toThrow(
      `Path not found: ${missing}. Use glob to locate the file or directory, or verify the path.`
    );
  });

  test("throws an actionable error when path is a file, not a directory", async () => {
    const root = await tempRoot();
    const file = join(root, "notes.txt");
    await writeFile(file, "hello", "utf8");

    await expect(findFiles(file, "**/*")).rejects.toThrow(
      `Glob path must be a directory: ${file}. Drop "path" and put the filename in "pattern", or use the read tool to inspect a single file.`
    );
  });
});
