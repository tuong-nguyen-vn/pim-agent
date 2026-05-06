import {
  chmod,
  link,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Hashline } from "../../shared/Hashline";
import { editFile, formatEditSummary } from "./edit";
import type { RawEdit } from "./schema";

const tempRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), "pim-edit-tool-"));

const anchor = (line: number, text: string): string =>
  Hashline.formatLine(line, text).split("|")[0] ?? "";

describe("editFile", () => {
  test("applies replace, append, and prepend bottom-up", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma", "utf8");

    const outcome = await editFile(path, [
      { op: "replace", pos: anchor(2, "beta"), content: "delta" },
      { op: "append", pos: anchor(3, "gamma"), content: "omega" },
      { op: "prepend", pos: anchor(1, "alpha"), content: "zero" },
    ]);

    expect(await readFile(path, "utf8")).toBe(
      "zero\nalpha\ndelta\ngamma\nomega"
    );
    expect(outcome.editCount).toBe(3);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.noops).toEqual([]);
    expect(outcome.diff).toBeDefined();
    expect(formatEditSummary(path, outcome)).toContain("Diff:\n");
  });

  test("aborts a batch without writing and reports stale anchors", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma\ndelta", "utf8");

    await expect(
      editFile(path, [
        { op: "replace", pos: "2zz|beta", content: "changed" },
        { op: "replace", pos: "4zz|delta", content: "bad" },
      ])
    ).rejects.toThrow(/E_HASH_MISMATCH] 2 stale anchors/);

    expect(await readFile(path, "utf8")).toBe("alpha\nbeta\ngamma\ndelta");
  });

  test("strips echoed hashline payloads with a warning", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta", "utf8");

    const outcome = await editFile(path, [
      {
        op: "replace",
        pos: anchor(2, "beta"),
        content: Hashline.formatLine(1, "not literal"),
      },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\nnot literal");
    expect(outcome.warnings.join("\n")).toContain(
      "Stripped read/diff prefixes"
    );
  });

  test("rejects unknown ops", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\n", "utf8");

    await expect(
      editFile(path, [
        { op: "replace_text" as unknown as RawEdit["op"], content: "x" },
      ])
    ).rejects.toThrow(/Expected "replace", "append", or "prepend"/);
  });

  test("auto-rebases a shifted anchor with a matching text hint", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\ninserted\nbeta", "utf8");

    const outcome = await editFile(path, [
      { op: "replace", pos: "2id|beta", content: "delta" },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\ninserted\ndelta");
    expect(outcome.warnings.join("\n")).toContain(
      "Auto-rebased anchor 2id -> 3id"
    );
  });

  test("warns for duplicated replacement boundary lines", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma", "utf8");

    const outcome = await editFile(path, [
      { op: "replace", pos: anchor(2, "beta"), content: "delta\ngamma" },
    ]);

    expect(outcome.warnings.join("\n")).toContain(
      "duplicates the next boundary line"
    );
  });

  test("deletes replacement ranges with empty content", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma", "utf8");

    await editFile(path, [
      { op: "replace", pos: anchor(2, "beta"), content: "" },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\ngamma");
  });

  test("throws on all-noop batches and tracks partial noops", async () => {
    const root = await tempRoot();
    const noopPath = join(root, "noop.txt");
    const partialPath = join(root, "partial.txt");
    await writeFile(noopPath, "alpha\nbeta", "utf8");
    await writeFile(partialPath, "alpha\nbeta", "utf8");

    await expect(
      editFile(noopPath, [
        { op: "replace", pos: anchor(2, "beta"), content: "beta" },
      ])
    ).rejects.toThrow(/E_NOOP_EDIT/);

    const partial = await editFile(partialPath, [
      { op: "replace", pos: anchor(1, "alpha"), content: "alpha" },
      { op: "replace", pos: anchor(2, "beta"), content: "delta" },
    ]);

    expect(await readFile(partialPath, "utf8")).toBe("alpha\ndelta");
    expect(partial.noops).toEqual([{ index: 0, range: "1" }]);
    expect(formatEditSummary(partialPath, partial)).toContain(
      "No-op:\n- Edit 0: range 1"
    );
  });

  test("rejects duplicate edits", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta", "utf8");

    const edit: RawEdit = {
      op: "replace",
      pos: anchor(2, "beta"),
      content: "delta",
    };

    await expect(editFile(path, [edit, edit])).rejects.toThrow(
      /E_DUPLICATE_EDIT/
    );
  });

  test("rejects overlapping edits and describes them", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma\ndelta", "utf8");

    await expect(
      editFile(path, [
        {
          op: "replace",
          pos: anchor(2, "beta"),
          end: anchor(3, "gamma"),
          content: "merged",
        },
        { op: "replace", pos: anchor(3, "gamma"), content: "changed" },
      ])
    ).rejects.toThrow(
      /E_OVERLAPPING_EDITS][\s\S]*Edit 0: replace lines 2-3[\s\S]*Edit 1: replace line 3/
    );
    expect(await readFile(path, "utf8")).toBe("alpha\nbeta\ngamma\ndelta");
  });

  test("updates symlink targets and preserves hard-link inodes plus mode", async () => {
    const root = await tempRoot();
    const target = join(root, "target.txt");
    const linked = join(root, "linked.txt");
    const alias = join(root, "alias.txt");

    await writeFile(target, "alpha\nbeta", "utf8");
    await chmod(target, 0o640);
    await link(target, linked);
    await symlink(target, alias);

    const before = await stat(target);

    await editFile(alias, [
      { op: "replace", pos: anchor(2, "beta"), content: "delta" },
    ]);

    const after = await stat(target);
    expect(await readFile(target, "utf8")).toBe("alpha\ndelta");
    expect(await readFile(linked, "utf8")).toBe("alpha\ndelta");
    expect(after.ino).toBe(before.ino);
    expect(Number(after.mode) & 0o777).toBe(0o640);
  });

  test("appends at EOF without inserting a phantom blank line for trailing-newline files", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma\n", "utf8");

    await editFile(path, [{ op: "append", content: "delta" }]);

    expect(await readFile(path, "utf8")).toBe("alpha\nbeta\ngamma\ndelta\n");
  });

  test("preserves the absence of a trailing newline when editing", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta", "utf8");

    await editFile(path, [{ op: "append", content: "gamma" }]);

    expect(await readFile(path, "utf8")).toBe("alpha\nbeta\ngamma");
  });

  test("rejects directories", async () => {
    const root = await tempRoot();

    await expect(
      editFile(root, [{ op: "append", content: "x" }])
    ).rejects.toThrow(/Path is a directory/);
  });

  test("rejects binary files", async () => {
    const root = await tempRoot();
    const path = join(root, "bin.dat");
    await Bun.write(path, new Uint8Array([0, 1, 2, 0, 4]));

    await expect(
      editFile(path, [{ op: "append", content: "x" }])
    ).rejects.toThrow(/binary file/);
  });

  test("rejects replace without pos", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\n", "utf8");

    await expect(
      editFile(path, [{ op: "replace", content: "x" } as unknown as RawEdit])
    ).rejects.toThrow(/replace requires "pos"/);
  });

  test("rejects append/prepend with end", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\n", "utf8");

    await expect(
      editFile(path, [
        {
          op: "append",
          pos: anchor(1, "alpha"),
          end: anchor(2, "beta"),
          content: "x",
        },
      ])
    ).rejects.toThrow(/Append does not support "end"/);
  });

  test("serializes concurrent edits on the same path", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "0\n", "utf8");

    const concurrent = await Promise.all([
      editFile(path, [{ op: "append", content: "1" }]),
      editFile(path, [{ op: "append", content: "2" }]),
      editFile(path, [{ op: "append", content: "3" }]),
    ]);

    const final = await readFile(path, "utf8");
    expect(
      final
        .split("\n")
        .filter((line) => line.length > 0)
        .sort()
    ).toEqual(["0", "1", "2", "3"]);
    expect(concurrent).toHaveLength(3);
  });

  test("buildDiff splits distant edits into separate hunks", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    const lines = Array.from(
      { length: 200 },
      (_, index) => `line ${index + 1}`
    );
    await writeFile(path, lines.join("\n"), "utf8");

    const outcome = await editFile(path, [
      { op: "replace", pos: anchor(1, "line 1"), content: "changed 1" },
      { op: "replace", pos: anchor(200, "line 200"), content: "changed 200" },
    ]);

    expect(outcome.diff?.hunks).toHaveLength(2);
    const summary = formatEditSummary(path, outcome);
    expect(summary).toContain("*1--|line 1 -> *1");
    expect(summary).toContain("*200--|line 200 -> *200");
  });

  test("places an append at the end of a replaced range before the lines that follow", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "one\ntwo\nthree\nfour", "utf8");

    await editFile(path, [
      {
        op: "replace",
        pos: anchor(2, "two"),
        end: anchor(3, "three"),
        content: "X",
      },
      { op: "append", pos: anchor(3, "three"), content: "Y" },
    ]);

    expect(await readFile(path, "utf8")).toBe("one\nX\nY\nfour");
  });

  test("preserves CRLF line endings when editing", async () => {
    const root = await tempRoot();
    const path = join(root, "crlf.txt");
    await writeFile(path, "alpha\r\nbeta\r\n", "utf8");

    await editFile(path, [
      { op: "replace", pos: anchor(2, "beta"), content: "delta" },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\r\ndelta\r\n");
  });

  test("does not strip a leading + from literal content", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta", "utf8");

    const outcome = await editFile(path, [
      { op: "replace", pos: anchor(2, "beta"), content: "+foo\nbar" },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\n+foo\nbar");
    expect(outcome.warnings).toEqual([]);
  });

  test("buildDiff represents pure inserts without treating shifted lines as changed", async () => {
    const root = await tempRoot();
    const path = join(root, "notes.txt");
    await writeFile(path, "alpha\nbeta\ngamma", "utf8");

    const outcome = await editFile(path, [
      { op: "append", pos: anchor(1, "alpha"), content: "inserted" },
    ]);

    expect(await readFile(path, "utf8")).toBe("alpha\ninserted\nbeta\ngamma");
    expect(outcome.diff?.hunks).toHaveLength(1);
    expect(outcome.diff?.hunks[0]?.lines).toEqual([
      { kind: "context", oldLine: 1, newLine: 1, text: "alpha" },
      { kind: "added", newLine: 2, text: "inserted" },
      { kind: "context", oldLine: 2, newLine: 3, text: "beta" },
      { kind: "context", oldLine: 3, newLine: 4, text: "gamma" },
    ]);
  });
});
