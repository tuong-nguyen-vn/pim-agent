import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderAmpCodeBlock } from "./index";

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
