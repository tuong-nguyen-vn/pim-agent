import { describe, expect, test } from "bun:test";
import { Markdown, visibleWidth } from "@earendil-works/pi-tui";
import extension, {
  applyMarkdownCodePatches,
  renderAmpCodeBlock,
} from "./index";

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
  test("patches Markdown.renderToken to drop fence chrome", async () => {
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

    const out = new Markdown(
      "```python\nprint(1)\n```\n\nhi",
      0,
      0,
      mdTheme
    ).render(40);
    const text = out.map((line) => line.trimEnd()).join("\n");

    expect(text).toContain("<python>print(1)");
    expect(text).not.toContain("```");
    expect(text).not.toContain("BORDER:");
  });

  test("applyMarkdownCodePatches is idempotent", async () => {
    const first = await applyMarkdownCodePatches();
    const second = await applyMarkdownCodePatches();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(0);
  });
});
