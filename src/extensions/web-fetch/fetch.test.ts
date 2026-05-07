import { describe, expect, test } from "bun:test";
import {
  clampMaxBytes,
  formatOutcome,
  truncateUtf8,
  validatePublicUrl,
} from "./fetch";
import {
  DEFAULT_FETCH_BYTES,
  MAX_FETCH_BYTES,
  MIN_FETCH_BYTES,
} from "./schema";

describe("clampMaxBytes", () => {
  test("defaults when undefined", () => {
    expect(clampMaxBytes(undefined)).toBe(DEFAULT_FETCH_BYTES);
  });

  test("clamps below minimum", () => {
    expect(clampMaxBytes(0)).toBe(MIN_FETCH_BYTES);
  });

  test("clamps above maximum", () => {
    expect(clampMaxBytes(MAX_FETCH_BYTES * 4)).toBe(MAX_FETCH_BYTES);
  });

  test("passes through valid values", () => {
    expect(clampMaxBytes(8 * 1024)).toBe(8 * 1024);
  });
});

describe("validatePublicUrl", () => {
  test("accepts http and https", () => {
    expect(validatePublicUrl("https://example.com/path")).toBe(
      "https://example.com/path"
    );
    expect(validatePublicUrl("http://example.com")).toBe("http://example.com/");
  });

  test("rejects non-http schemes", () => {
    expect(() => validatePublicUrl("ftp://example.com")).toThrow(/http/);
    expect(() => validatePublicUrl("file:///etc/passwd")).toThrow(/http/);
  });

  test("rejects malformed URLs", () => {
    expect(() => validatePublicUrl("not a url")).toThrow(/valid/);
  });

  test("rejects embedded credentials", () => {
    expect(() => validatePublicUrl("https://user:pw@example.com")).toThrow(
      /credentials/
    );
  });

  test("rejects localhost and .local", () => {
    expect(() => validatePublicUrl("http://localhost/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://printer.local/")).toThrow(/public/);
  });

  test("rejects RFC1918 IPv4", () => {
    expect(() => validatePublicUrl("http://10.0.0.1/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://192.168.1.1/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://172.16.0.1/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://127.0.0.1/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://169.254.0.1/")).toThrow(/public/);
  });

  test("rejects IPv6 loopback and link-local", () => {
    expect(() => validatePublicUrl("http://[::1]/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://[fe80::1]/")).toThrow(/public/);
    expect(() => validatePublicUrl("http://[fc00::1]/")).toThrow(/public/);
  });

  test("accepts public IPs", () => {
    expect(validatePublicUrl("http://8.8.8.8/")).toBe("http://8.8.8.8/");
  });
});

describe("truncateUtf8", () => {
  test("returns content unchanged when under cap", () => {
    const result = truncateUtf8("hello", 1024);
    expect(result.body).toBe("hello");
    expect(result.truncated).toBe(false);
    expect(result.totalBytes).toBe(5);
    expect(result.returnedBytes).toBe(5);
  });

  test("truncates ASCII at exact byte boundary", () => {
    const content = "a".repeat(100);
    const result = truncateUtf8(content, 10);
    expect(result.body).toBe("a".repeat(10));
    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(100);
    expect(result.returnedBytes).toBe(10);
  });

  test("backs off to a UTF-8 boundary mid-codepoint", () => {
    // "é" is 2 bytes (0xc3 0xa9). Cap of 1 byte must back off to 0.
    const result = truncateUtf8("é", 1);
    expect(result.body).toBe("");
    expect(result.returnedBytes).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(2);
  });

  test("preserves complete multi-byte chars", () => {
    // "héllo" — h(1) + é(2) + llo(3) = 6 bytes. Cap of 3 = "hé".
    const result = truncateUtf8("héllo", 3);
    expect(result.body).toBe("hé");
    expect(result.returnedBytes).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(6);
  });

  test("backs off across a 4-byte sequence", () => {
    // "🦀" = 4 bytes. Cap 2 must back off all the way.
    const result = truncateUtf8("🦀x", 2);
    expect(result.body).toBe("");
    expect(result.returnedBytes).toBe(0);
    expect(result.truncated).toBe(true);
  });
});

describe("formatOutcome", () => {
  const page = {
    title: "Example",
    url: "https://example.test/page",
    content: "hello world",
  };

  test("formats untruncated page", () => {
    const outcome = formatOutcome(page, 1024, "markdown");
    expect(outcome.text).toBe(
      [
        "title: Example",
        "url: https://example.test/page",
        "format: markdown",
        "content:",
        "hello world",
      ].join("\n")
    );
    expect(outcome.truncated).toBe(false);
    expect(outcome.returnedBytes).toBe(11);
    expect(outcome.totalBytes).toBe(11);
    expect(outcome.format).toBe("markdown");
  });

  test("appends truncation footer when over cap", () => {
    const long = { ...page, content: "x".repeat(2000) };
    const outcome = formatOutcome(long, 100, "html");
    expect(outcome.truncated).toBe(true);
    expect(outcome.returnedBytes).toBe(100);
    expect(outcome.totalBytes).toBe(2000);
    expect(outcome.text).toContain(
      "[web_fetch tool: truncated — kept first 100 bytes of 2000;"
    );
    expect(outcome.text).toContain(`cap ${MAX_FETCH_BYTES}`);
  });
});
