import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fitBorder } from "./AmpEditor";

describe("fitBorder", () => {
  test("places status text inside a full-width editor border", () => {
    const rendered = fitBorder(
      " 9% of 300K ",
      " smart 14-skills ",
      60,
      (s) => s
    );

    expect(rendered).toStartWith("─ 9% of 300K ");
    expect(rendered).toEndWith(" smart 14-skills ─");
    expect(visibleWidth(rendered)).toBe(60);
  });

  test("truncates labels before exceeding narrow widths", () => {
    for (const width of [0, 1, 5, 10, 20]) {
      const rendered = fitBorder(
        " long context label ",
        " long model label ",
        width,
        (s) => s
      );
      expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
    }
  });
});
