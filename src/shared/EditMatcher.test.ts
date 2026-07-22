import { describe, expect, test } from "bun:test";
import { EditMatcher, type ClosestRegion } from "./EditMatcher";
import { Levenshtein } from "./Levenshtein";

/**
 * Pre-optimization reference implementation of findClosestRegions: exhaustive
 * per-line Levenshtein with no length-bound pruning. Used to fuzz-check that
 * the pruned implementation in EditMatcher never changes the result.
 */
function naiveFindClosestRegions(
  content: string,
  oldString: string,
  max = 3,
  threshold = 0.5
): readonly ClosestRegion[] {
  const logicalLines = (text: string): readonly string[] => {
    if (text.length === 0) {
      return [];
    }
    const lines = text.split(/\r?\n/u);
    if (lines.at(-1) === "") {
      lines.pop();
    }
    return lines;
  };
  const lineSimilarity = (left: string, right: string): number => {
    const a = left.trim();
    const b = right.trim();
    const longest = Math.max(a.length, b.length);
    if (longest === 0) {
      return 1;
    }
    return 1 - Levenshtein.distance(a, b) / longest;
  };

  const contentLines = logicalLines(content);
  const searchLines = logicalLines(oldString);
  const windowSize = Math.max(1, searchLines.length);
  const regions: ClosestRegion[] = [];

  if (contentLines.length === 0 || searchLines.length === 0) {
    return [];
  }

  for (let index = 0; index <= contentLines.length - windowSize; index += 1) {
    const window = contentLines.slice(index, index + windowSize);
    let total = 0;
    for (let offset = 0; offset < windowSize; offset += 1) {
      total += lineSimilarity(searchLines[offset] ?? "", window[offset] ?? "");
    }
    const similarity = total / windowSize;
    if (similarity >= threshold) {
      regions.push({
        startLine: index + 1,
        endLine: index + windowSize,
        similarity,
        text: window.join("\n"),
      });
    }
  }

  return regions
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, max);
}

// Deterministic PRNG so fuzz failures are reproducible without a fixed seed file.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLine(rand: () => number): string {
  const alphabet = "abcdefghij ()[]{};,.\"'_-0123456789";
  const length = Math.floor(rand() * 40); // includes empty lines
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}

function randomDocument(rand: () => number, lineCount: number): string {
  return Array.from({ length: lineCount }, () => randomLine(rand)).join("\n");
}

const replace = (
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): string => {
  const resolved = EditMatcher.resolve(content, oldString, replaceAll);
  const ranges = "ranges" in resolved ? resolved.ranges : [resolved.range];
  return EditMatcher.applyAll(
    content,
    ranges.map((range) => ({ range, newString }))
  );
};

describe("EditMatcher", () => {
  test("resolves exact matches", () => {
    expect(replace("alpha\nbeta\ngamma", "beta", "delta")).toBe(
      "alpha\ndelta\ngamma"
    );
  });

  test("uses lineTrimmed fallback", () => {
    expect(replace("alpha\n  beta\ngamma", "beta ", "delta")).toBe(
      "alpha\ndelta\ngamma"
    );
  });

  test("uses whitespaceNormalized fallback", () => {
    expect(replace("alpha\nfoo     bar\ngamma", "foo bar", "baz")).toBe(
      "alpha\nbaz\ngamma"
    );
  });

  test("uses indentationFlexible fallback", () => {
    const content = "root\n    if (ok) {\n      run()\n    }\nend";
    const oldString = "if (ok) {\n  run()\n}";
    expect(replace(content, oldString, "done()")).toBe("root\ndone()\nend");
  });

  test("uses escapeNormalized fallback", () => {
    expect(replace("alpha\nbeta\ngamma", "beta\\ngamma", "delta")).toBe(
      "alpha\ndelta"
    );
  });

  test("uses trimmedBoundary fallback", () => {
    expect(replace("alpha\nbeta\ngamma", "\n beta \n", "delta")).toBe(
      "alpha\ndelta\ngamma"
    );
  });

  test("uses unicodeNormalized fallback", () => {
    expect(replace("say “hello” now", 'say "hello" now', "done")).toBe("done");
  });

  test("uses blockAnchor fallback with same-line-count constraint", () => {
    const content = [
      "start",
      "actual middle",
      "end",
      "start",
      "one",
      "two",
      "three",
      "end",
    ].join("\n");

    expect(replace(content, "start\nexpected middle\nend", "done")).toBe(
      ["done", "start", "one", "two", "three", "end"].join("\n")
    );
  });

  test("blockAnchor matches 3-line region with drifted middle", () => {
    const content = ["start", "drifted middle", "end"].join("\n");
    expect(replace(content, "start\nexpected middle\nend", "done")).toBe(
      "done"
    );
  });

  test("uses contextAware fallback", () => {
    const content = "start\nsame\nactual\nend";
    expect(replace(content, "start\nsame\nexpected\nend", "done")).toBe("done");
  });

  test("replaceAll returns every occurrence", () => {
    expect(replace("foo\nbar\nfoo", "foo", "baz", true)).toBe("baz\nbar\nbaz");
  });

  test("throws multiple matches without replaceAll", () => {
    expect(() => EditMatcher.resolve("foo\nbar\nfoo", "foo")).toThrow(
      /matched multiple regions/
    );
  });

  test("not found includes closest regions above threshold", () => {
    const closest = EditMatcher.findClosestRegions(
      "alpha\nbeta\ngamma",
      "betx"
    );
    expect(closest[0]?.startLine).toBe(2);
    expect(closest[0]?.similarity).toBeGreaterThan(0.5);
  });

  test("not found returns no regions below threshold", () => {
    const closest = EditMatcher.findClosestRegions("aaaa\nbbbb", "zzzz");
    expect(closest).toEqual([]);
  });

  test("findClosestRegions includes a region that sits exactly on the prune-bound boundary", () => {
    // "aaaaaaaaaa" (10 a's) vs "aaaaa" (5 a's): length-diff bound is exactly
    // 0.5 (1 - 5/10), and the true Levenshtein similarity is also exactly 0.5
    // (5 deletions / 10 chars). This pins the length-diff prune check right at
    // the threshold boundary, so a prune bound that's even slightly too
    // aggressive (e.g. comparing against threshold * 1.5 instead of
    // threshold) would wrongly drop this region.
    const closest = EditMatcher.findClosestRegions(
      "aaaaaaaaaa",
      "aaaaa",
      3,
      0.5
    );
    expect(closest).toHaveLength(1);
    expect(closest[0]?.similarity).toBeCloseTo(0.5);
  });

  test("findClosestRegions handles empty-trimmed lines without dividing by zero", () => {
    const content = "\n\n\n";
    const closest = EditMatcher.findClosestRegions(content, "\n\n");
    expect(closest.every((region) => region.similarity === 1)).toBe(true);
  });

  test("findClosestRegions handles multi-byte/unicode lines", () => {
    const content = "caf\u00e9\nna\u00efve\n\u65e5\u672c\u8a9e";
    const closest = EditMatcher.findClosestRegions(content, "caff\u00e9");
    expect(closest[0]?.startLine).toBe(1);
    expect(closest[0]?.similarity).toBeGreaterThan(0.5);
  });

  test("findClosestRegions returns nothing when oldString is longer than content", () => {
    expect(EditMatcher.findClosestRegions("a\nb", "a\nb\nc\nd\ne")).toEqual([]);
  });

  test("findClosestRegions matches equivalent naive brute-force implementation", () => {
    const rand = mulberry32(0xed17_ac7a);

    for (let trial = 0; trial < 300; trial += 1) {
      const contentLineCount = 1 + Math.floor(rand() * 30);
      const searchLineCount = 1 + Math.floor(rand() * 8);
      const content = randomDocument(rand, contentLineCount);
      const oldString = randomDocument(rand, searchLineCount);
      const threshold = 0.3 + rand() * 0.5;

      const actual = EditMatcher.findClosestRegions(
        content,
        oldString,
        3,
        threshold
      );
      const expected = naiveFindClosestRegions(
        content,
        oldString,
        3,
        threshold
      );

      expect(actual).toEqual(expected);
    }
  });

  test("findClosestRegions matches naive implementation on near-threshold perturbations", () => {
    // Random unrelated content rarely lands near the similarity threshold, which
    // would let an incorrect prune bound slip through undetected. Build windows
    // that are small perturbations of oldString so many similarities cluster
    // right around the threshold boundary, where a wrong bound is most likely
    // to diverge from the naive brute-force result.
    const rand = mulberry32(0x1234_5678);

    for (let trial = 0; trial < 300; trial += 1) {
      const lineCount = 1 + Math.floor(rand() * 6);
      const oldString = randomDocument(rand, lineCount)
        .split("\n")
        .map((line) =>
          line.length === 0 ? "x".repeat(1 + Math.floor(rand() * 10)) : line
        )
        .join("\n");
      const searchLines = oldString.split("\n");

      const contentLines: string[] = [];
      const noiseLineCount = Math.floor(rand() * 10);
      for (let i = 0; i < noiseLineCount; i += 1) {
        contentLines.push(randomLine(rand));
      }

      // Perturb each line of oldString by a small, variable number of
      // character edits so the resulting window similarity is scattered
      // both above and below common thresholds (0.3-0.8).
      for (const line of searchLines) {
        const chars = line.split("");
        const editCount = Math.floor(rand() * (chars.length + 1) * 0.6);
        for (let e = 0; e < editCount; e += 1) {
          const pos = Math.floor(rand() * (chars.length || 1));
          const op = rand();
          if (chars.length === 0 || op < 0.34) {
            chars.splice(
              pos,
              0,
              String.fromCharCode(97 + Math.floor(rand() * 26))
            );
          } else if (op < 0.67) {
            chars.splice(pos, 1);
          } else if (chars.length > 0) {
            chars[pos] = String.fromCharCode(97 + Math.floor(rand() * 26));
          }
        }
        contentLines.push(chars.join(""));
      }

      for (let i = 0; i < noiseLineCount; i += 1) {
        contentLines.push(randomLine(rand));
      }

      const content = contentLines.join("\n");
      const threshold = 0.3 + rand() * 0.5;

      const actual = EditMatcher.findClosestRegions(
        content,
        oldString,
        3,
        threshold
      );
      const expected = naiveFindClosestRegions(
        content,
        oldString,
        3,
        threshold
      );

      expect(actual).toEqual(expected);
    }
  });

  test("findClosestRegions matches naive implementation when a region is an exact substring", () => {
    const rand = mulberry32(0x9e37_79b9);

    for (let trial = 0; trial < 50; trial += 1) {
      const before = randomDocument(rand, 1 + Math.floor(rand() * 10));
      const needle = randomDocument(rand, 1 + Math.floor(rand() * 5));
      const after = randomDocument(rand, 1 + Math.floor(rand() * 10));
      const content = [before, needle, after].filter(Boolean).join("\n");

      const actual = EditMatcher.findClosestRegions(content, needle);
      const expected = naiveFindClosestRegions(content, needle);

      expect(actual).toEqual(expected);
    }
  });

  test("escape-drift guard rejects new escape sequences after fuzzy match", () => {
    const resolved = EditMatcher.resolve("  beta", "beta ");
    const range = "range" in resolved ? resolved.range : resolved.ranges[0]!;
    expect(() =>
      EditMatcher.assertNoEscapeDrift(
        resolved.strategy,
        "new\\nvalue",
        "  beta".slice(range[0], range[1])
      )
    ).toThrow(/newString contains literal escape text/);
  });
});
