import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Markdown, visibleWidth } from "@earendil-works/pi-tui";
import extension, {
  applyMarkdownCodePatches,
  renderAmpCodeBlock,
  resolvePiTuiPathsFromEntry,
} from "./index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const theme = {
  codeBlockIndent: "  ",
  codeBlock: (text: string) => text,
  codeBlockBorder: (text: string) => `BORDER:${text}`,
  highlightCode: (code: string, lang?: string) =>
    code.split("\n").map((line) => (lang ? `<${lang}>${line}` : line)),
};

describe("renderAmpCodeBlock", () => {
  test("drops fence chrome and keeps indented highlighted lines", () => {
    const rendered = renderAmpCodeBlock(
      theme as never,
      { text: 'console.log("hi")\nreturn 1', lang: "js" },
      "paragraph"
    );

    expect(rendered).toEqual(['  <js>console.log("hi")', "  <js>return 1", ""]);
    expect(rendered.join("\n")).not.toContain("```");
    expect(rendered.join("\n")).not.toContain("BORDER:");
  });

  test("does not add trailing blank line when a space token follows", () => {
    const rendered = renderAmpCodeBlock(
      theme as never,
      { text: "amp-pi", lang: "bash" },
      "space"
    );

    expect(rendered).toEqual(["  <bash>amp-pi"]);
  });

  test("falls back to codeBlock styling without highlightCode", () => {
    const plainTheme = {
      codeBlockIndent: "  ",
      codeBlock: (text: string) => `{${text}}`,
    };
    const rendered = renderAmpCodeBlock(
      plainTheme as never,
      { text: "a\nb" },
      undefined
    );

    expect(rendered).toEqual(["  {a}", "  {b}"]);
    for (const line of rendered) {
      expect(visibleWidth(line)).toBeGreaterThan(0);
    }
  });
});

describe("markdown-code extension", () => {
  test("drops fence chrome for every fenced code block language", async () => {
    await extension({
      on() {},
    } as never);

    const mdTheme = {
      heading: (s: string) => s,
      link: (s: string) => s,
      linkUrl: (s: string) => s,
      code: (s: string) => s,
      codeBlock: (s: string) => s,
      codeBlockBorder: (s: string) => `BORDER:${s}`,
      quote: (s: string) => s,
      quoteBorder: (s: string) => s,
      hr: (s: string) => s,
      listBullet: (s: string) => s,
      bold: (s: string) => s,
      italic: (s: string) => s,
      strikethrough: (s: string) => s,
      underline: (s: string) => s,
      highlightCode: (code: string, lang?: string) =>
        code.split("\n").map((line) => (lang ? `<${lang}>${line}` : line)),
      codeBlockIndent: "  ",
    };

    const markdown = [
      "```text",
      "@@session:<id>",
      "```",
      "",
      "```ts",
      "read_session({ id })",
      "```",
      "",
      "```python",
      "print(1)",
      "```",
      "",
      "```json",
      '{"ok":true}',
      "```",
      "",
      "```made-up-language",
      "unknown()",
      "```",
      "",
      "```",
      "plain",
      "```",
    ].join("\n");

    const out = new Markdown(markdown, 0, 0, mdTheme).render(80);
    const text = out.map((line) => line.trimEnd()).join("\n");

    expect(text).toContain("<text>@@session:<id>");
    expect(text).toContain("<ts>read_session({ id })");
    expect(text).toContain("<python>print(1)");
    expect(text).toContain('<json>{"ok":true}');
    expect(text).toContain("unknown()");
    expect(text).toContain("plain");
    expect(text).not.toContain("```");
    expect(text).not.toContain("BORDER:");
  });

  test("finds nested and hoisted pi-tui installs from one entry", () => {
    const root = mkdtempSync(join(tmpdir(), "pim-markdown-code-"));
    tempDirs.push(root);

    const packageRoot = join(
      root,
      "node_modules",
      "@earendil-works",
      "pi-coding-agent"
    );
    const entry = join(packageRoot, "dist", "cli.js");
    const nested = join(
      packageRoot,
      "node_modules",
      "@earendil-works",
      "pi-tui",
      "dist",
      "index.js"
    );
    const hoisted = join(
      root,
      "node_modules",
      "@earendil-works",
      "pi-tui",
      "dist",
      "index.js"
    );

    for (const file of [entry, nested, hoisted]) {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "export class Markdown {}\n");
    }

    expect(new Set(resolvePiTuiPathsFromEntry(entry))).toEqual(
      new Set([nested, hoisted])
    );
  });

  test("applyMarkdownCodePatches is idempotent", async () => {
    const first = await applyMarkdownCodePatches();
    const second = await applyMarkdownCodePatches();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(0);
  });
});
