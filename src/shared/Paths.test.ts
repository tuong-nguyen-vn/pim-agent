import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Paths } from "./Paths";

describe("Paths.resolve", () => {
  test("resolves relative paths against base", () => {
    expect(Paths.resolve("foo.txt", "/work")).toBe("/work/foo.txt");
    expect(Paths.resolve("src/foo.ts", "/work")).toBe("/work/src/foo.ts");
  });

  test("expands ~ to home directory", () => {
    const home = homedir();
    expect(Paths.resolve("~", "/tmp")).toBe(home);
    expect(Paths.resolve("~/.config", "/tmp")).toBe(join(home, ".config"));
  });

  test("preserves absolute paths", () => {
    expect(Paths.resolve("/etc/hosts", "/tmp")).toBe("/etc/hosts");
  });
});

describe("Paths.displayRelative", () => {
  test("returns relative path when inside cwd", () => {
    expect(Paths.displayRelative("/work/src/foo.ts", "/work")).toBe(
      "src/foo.ts"
    );
  });

  test("returns absolute path when outside cwd", () => {
    expect(Paths.displayRelative("/etc/hosts", "/work")).toBe("/etc/hosts");
  });

  test("returns absolute path when cwd equals path", () => {
    expect(Paths.displayRelative("/work", "/work")).toBe("/work");
  });
});

describe("Paths.titleOr", () => {
  test("returns the placeholder when path is undefined", () => {
    expect(Paths.titleOr(undefined, "/work")).toBe("...");
  });

  test("returns a path relative to cwd when within cwd", () => {
    expect(Paths.titleOr("/work/src/file.ts", "/work")).toBe("src/file.ts");
  });

  test("returns the absolute path when outside cwd", () => {
    expect(Paths.titleOr("/other/file.ts", "/work")).toBe("/other/file.ts");
  });
});

describe("Paths.cwdSuffix", () => {
  test("returns empty string when cwd is undefined", () => {
    expect(Paths.cwdSuffix(undefined, "/work")).toBe("");
  });

  test("returns empty string when cwd resolves to baseCwd", () => {
    expect(Paths.cwdSuffix(".", "/work")).toBe("");
    expect(Paths.cwdSuffix("/work", "/work")).toBe("");
  });

  test("returns ' (in: <relative>)' for a relative cwd", () => {
    expect(Paths.cwdSuffix("hrm/backend", "/work")).toBe(" (in: hrm/backend)");
  });

  test("returns ' (in: <relative>)' for an absolute cwd under base", () => {
    expect(Paths.cwdSuffix("/work/hrm", "/work")).toBe(" (in: hrm)");
  });

  test("abbreviates home for a cwd outside the workspace", () => {
    expect(
      Paths.cwdSuffix("~/Workspaces/projects/hdx", "/Users/me/work")
    ).toBe(" (in: ~/Workspaces/projects/hdx)");
  });
});

describe("Paths.requireAbsolute", () => {
  test("returns the expanded path for an absolute path", () => {
    expect(Paths.requireAbsolute("/work/hrm")).toBe("/work/hrm");
  });

  test("expands ~ and returns the absolute home path", () => {
    const home = homedir();
    expect(Paths.requireAbsolute("~/Workspaces")).toBe(
      join(home, "Workspaces")
    );
  });

  test("throws for a relative path", () => {
    expect(() => Paths.requireAbsolute("attendance/backend")).toThrow(
      "Path must be absolute, not relative: attendance/backend"
    );
  });

  test("throws for a dot-prefixed relative path", () => {
    expect(() => Paths.requireAbsolute("./hrm")).toThrow(
      "Path must be absolute, not relative: ./hrm"
    );
  });
});
