import { describe, expect, test } from "bun:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderAmpUserMessage } from "./index";

const theme = {
  fg: (_color: string, text: string) => text,
  italic: (text: string) => `<i>${text}</i>`,
} as unknown as Theme;

describe("renderAmpUserMessage", () => {
  test("turns the padded user card into an AMP-style quoted line", () => {
    const rendered = renderAmpUserMessage(
      [
        "\x1b]133;A\x07\x1b[48;2;52;53;65m          \x1b[49m",
        " hello    ",
        "\x1b]133;B\x07\x1b]133;C\x07\x1b[48;2;52;53;65m          \x1b[49m",
      ],
      40,
      theme
    );

    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain("│ <i>hello    </i>");
    expect(rendered[0]).not.toContain("          ");
  });

  test("does not exceed the available width", () => {
    const [line] = renderAmpUserMessage([" a very long prompt"], 12, theme);
    expect(visibleWidth(line ?? "")).toBeLessThanOrEqual(12);
  });
});
