import { describe, expect, test } from "bun:test";
import { formatTitle } from "./render";

describe("formatTitle", () => {
  test("returns placeholder when url is undefined", () => {
    expect(formatTitle(undefined, undefined, undefined)).toBe("...");
  });

  test("returns bare url for auto / undefined format pre-result", () => {
    expect(formatTitle("https://example.com", undefined, undefined)).toBe(
      "https://example.com"
    );
    expect(formatTitle("https://example.com", "auto", undefined)).toBe(
      "https://example.com"
    );
  });

  test("annotates url with explicit format pre-result", () => {
    expect(formatTitle("https://example.com", "markdown", undefined)).toBe(
      "https://example.com [markdown]"
    );
  });

  test("renders size + format label after result arrives", () => {
    expect(
      formatTitle("https://example.com", "auto", {
        format: "markdown",
        totalBytes: 23 * 1024,
      })
    ).toBe("https://example.com (23KB Markdown)");
  });

  test("strips trailing zeros and supports two decimals", () => {
    expect(
      formatTitle("https://example.com", undefined, {
        format: "html",
        totalBytes: 5355,
      })
    ).toBe("https://example.com (5.23KB HTML)");
  });

  test("renders bytes for tiny payloads", () => {
    expect(
      formatTitle("https://example.com", undefined, {
        format: "markdown",
        totalBytes: 512,
      })
    ).toBe("https://example.com (512B Markdown)");
  });

  test("renders MB for large payloads", () => {
    expect(
      formatTitle("https://example.com", undefined, {
        format: "html",
        totalBytes: 2.5 * 1024 * 1024,
      })
    ).toBe("https://example.com (2.5MB HTML)");
  });
});
