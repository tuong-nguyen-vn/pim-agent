import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { FsErrors } from "../../shared/FsErrors";
import { GitignoreFilter } from "../../shared/GitignoreFilter";
import { Hashline } from "../../shared/Hashline";

const MATCH_CONCURRENCY = 32;

export type GrepMatch = {
  readonly filePath: string;
  readonly mtime: number;
  readonly lines: readonly {
    readonly lineNumber: number;
    readonly text: string;
  }[];
};

export function buildRegex(
  pattern: string,
  multiline: boolean,
  caseInsensitive: boolean
): RegExp {
  const flags = `${multiline ? "s" : ""}${caseInsensitive ? "i" : ""}`;

  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid regular expression /${pattern}/${flags}: ${message}. Escape regex metacharacters or simplify the pattern.`
    );
  }
}

export async function findMatches(
  path: string,
  glob: string | undefined,
  regex: RegExp
): Promise<readonly GrepMatch[]> {
  const metadata = await statOrThrow(path);
  const files = metadata.isFile()
    ? [path]
    : await scanFiles(path, glob ?? "**/*");
  const results: GrepMatch[] = [];

  for (let index = 0; index < files.length; index += MATCH_CONCURRENCY) {
    const chunk = files.slice(index, index + MATCH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((filePath) => matchFile(filePath, regex))
    );

    for (const match of chunkResults) {
      if (match !== undefined) {
        results.push(match);
      }
    }
  }

  return results;
}

async function matchFile(
  filePath: string,
  regex: RegExp
): Promise<GrepMatch | undefined> {
  const file = Bun.file(filePath);

  if (await Hashline.isBinary(file)) {
    return undefined;
  }

  const lines = Hashline.splitLines(await file.text());
  const lineMatches: { lineNumber: number; text: string }[] = [];

  for (const [index, line] of lines.entries()) {
    if (regex.test(line)) {
      lineMatches.push({ lineNumber: index + 1, text: line });
    }
  }

  if (lineMatches.length === 0) {
    return undefined;
  }

  return {
    filePath,
    mtime: file.lastModified,
    lines: lineMatches,
  };
}

async function scanFiles(
  path: string,
  pattern: string
): Promise<readonly string[]> {
  const root = resolve(path);
  const filter = await GitignoreFilter.for(root);
  const glob = new Bun.Glob(pattern);
  const files: string[] = [];

  for await (const filePath of glob.scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
  })) {
    if (!filter.ignores(filePath)) {
      files.push(filePath);
    }
  }

  return files.sort(comparePaths);
}

function comparePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

async function statOrThrow(
  path: string
): Promise<Awaited<ReturnType<typeof stat>>> {
  try {
    return await stat(path);
  } catch (error) {
    const code = FsErrors.code(error);

    if (code === "ENOENT") {
      throw new Error(
        `Path not found: ${path}. Use glob to locate the file or directory, or verify the path.`
      );
    }

    if (code === "EACCES" || code === "EPERM") {
      throw new Error(`Permission denied accessing ${path}.`);
    }

    throw new Error(
      `Cannot stat ${path}: ${code ?? (error instanceof Error ? error.message : "unknown error")}.`
    );
  }
}
