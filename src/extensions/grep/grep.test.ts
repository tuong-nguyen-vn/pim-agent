import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildRegex, findMatches } from "./grep";

const tempRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), "pim-grep-tool-"));

describe("buildRegex", () => {
  test("compiles with no flags by default", () => {
    const regex = buildRegex("alpha", false, false);
    expect(regex.flags).toBe("");
    expect(regex.test("alpha")).toBe(true);
    expect(regex.test("Alpha")).toBe(false);
  });

  test("applies the i flag for caseInsensitive", () => {
    const regex = buildRegex("alpha", false, true);
    expect(regex.flags).toBe("i");
    expect(regex.test("Alpha")).toBe(true);
  });

  test("applies the s flag for multiline (dotall)", () => {
    const regex = buildRegex(".", true, false);
    expect(regex.flags).toBe("s");
    expect(regex.test("\n")).toBe(true);
  });

  test("throws an actionable error on invalid syntax", () => {
    expect(() => buildRegex("(", false, false)).toThrow(
      /Invalid regular expression/
    );
  });
});

describe("findMatches", () => {
  test("returns content matches sorted by recency, with line numbers", async () => {
    const root = await tempRoot();
    const nested = join(root, "nested");
    const older = join(root, "older.txt");
    const newer = join(nested, "newer.txt");

    await mkdir(nested);
    await writeFile(older, "alpha\nbeta", "utf8");
    await writeFile(newer, "gamma\nalphabet\nalpha", "utf8");
    await utimes(
      older,
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-01-01T00:00:00Z")
    );
    await utimes(
      newer,
      new Date("2024-01-02T00:00:00Z"),
      new Date("2024-01-02T00:00:00Z")
    );

    const matches = await findMatches(
      root,
      undefined,
      buildRegex("alpha", false, false)
    );

    expect(matches.map((match) => match.filePath)).toEqual([newer, older]);
    expect(matches[0]?.lines).toEqual([
      { lineNumber: 2, text: "alphabet" },
      { lineNumber: 3, text: "alpha" },
    ]);
    expect(matches[1]?.lines).toEqual([{ lineNumber: 1, text: "alpha" }]);
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
    await writeFile(ignored, "needle\n", "utf8");
    await writeFile(kept, "needle\n", "utf8");
    await writeFile(nodeModules, "needle\n", "utf8");
    await writeFile(dot, "needle\n", "utf8");

    const matches = await findMatches(
      root,
      undefined,
      buildRegex("needle", false, false)
    );

    expect(matches.map((match) => match.filePath)).toEqual([kept]);
  });

  test("filters by glob", async () => {
    const root = await tempRoot();
    const ts = join(root, "a.ts");
    const md = join(root, "a.md");

    await writeFile(ts, "needle", "utf8");
    await writeFile(md, "needle", "utf8");

    const matches = await findMatches(
      root,
      "**/*.ts",
      buildRegex("needle", false, false)
    );

    expect(matches.map((match) => match.filePath)).toEqual([ts]);
  });

  test("skips binary files", async () => {
    const root = await tempRoot();
    const text = join(root, "text.txt");
    const binary = join(root, "data.bin");

    await writeFile(text, "needle\n", "utf8");
    await Bun.write(binary, new Uint8Array([0x6e, 0x00, 0x65, 0x65]));

    const matches = await findMatches(
      root,
      undefined,
      buildRegex("n", false, false)
    );

    expect(matches.map((match) => match.filePath)).toEqual([text]);
  });

  test("matches a single file path directly", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\nalphabet", "utf8");

    const matches = await findMatches(
      path,
      undefined,
      buildRegex("alpha", false, false)
    );

    expect(matches.length).toBe(1);
    expect(matches[0]?.lines).toEqual([
      { lineNumber: 1, text: "alpha" },
      { lineNumber: 3, text: "alphabet" },
    ]);
  });

  test("throws an actionable error when the path does not exist", async () => {
    const root = await tempRoot();
    const missing = join(root, "nope");

    await expect(
      findMatches(missing, undefined, buildRegex("x", false, false))
    ).rejects.toThrow(
      `Path not found: ${missing}. Use glob to locate the file or directory, or verify the path.`
    );
  });
});
