import { Paths } from "../../shared/Paths";
import type { GrepMatch } from "./grep";
import type { GrepOutputMode } from "./schema";

export type RenderOutcome = {
  readonly body: string;
  readonly totalItems: number;
  readonly visibleItems: number;
  readonly truncated: boolean;
  readonly fileCount: number;
  readonly totalMatches: number;
  readonly itemNoun: string;
};

const renderers: Record<
  GrepOutputMode,
  {
    readonly itemNoun: string;
    readonly toLines: (matches: readonly GrepMatch[]) => readonly string[];
  }
> = {
  files_with_matches: { itemNoun: "files", toLines: renderFiles },
  content: { itemNoun: "lines", toLines: renderContent },
  count: { itemNoun: "files", toLines: renderCounts },
};

export function renderMatches(
  matches: readonly GrepMatch[],
  outputMode: GrepOutputMode,
  headLimit: number
): RenderOutcome {
  const totalMatches = matches.reduce(
    (sum, match) => sum + match.lines.length,
    0
  );
  const { itemNoun, toLines } = renderers[outputMode];
  const lines = toLines(matches);

  if (lines.length === 0) {
    return {
      body: "No matches.",
      totalItems: 0,
      visibleItems: 0,
      truncated: false,
      fileCount: 0,
      totalMatches: 0,
      itemNoun,
    };
  }

  const visible = lines.slice(0, headLimit);
  const truncated = lines.length > headLimit;

  return {
    body: visible.join("\n"),
    totalItems: lines.length,
    visibleItems: visible.length,
    truncated,
    fileCount: matches.length,
    totalMatches,
    itemNoun,
  };
}

export type TitleOptions = {
  readonly pattern: string | undefined;
  readonly path: string | undefined;
  readonly glob: string | undefined;
  readonly outputMode: GrepOutputMode;
  readonly cwd: string;
};

export function formatTitle(options: TitleOptions): string {
  const pattern = options.pattern ?? "...";
  const target = Paths.titleOr(options.path, options.cwd, ".");
  const glob = options.glob ? ` ${options.glob}` : "";
  return `/${pattern}/ in ${target}${glob} (${options.outputMode})`;
}

function renderFiles(matches: readonly GrepMatch[]): readonly string[] {
  return byRecency(matches).map((match) => match.filePath);
}

function renderContent(matches: readonly GrepMatch[]): readonly string[] {
  return byRecency(matches).flatMap((match) =>
    match.lines.map(
      (line) => `${match.filePath}:${line.lineNumber}:${line.text}`
    )
  );
}

function renderCounts(matches: readonly GrepMatch[]): readonly string[] {
  return [...matches]
    .sort(
      (left, right) =>
        right.lines.length - left.lines.length ||
        right.mtime - left.mtime ||
        comparePaths(left.filePath, right.filePath)
    )
    .map((match) => `${match.filePath}:${match.lines.length}`);
}

function byRecency(matches: readonly GrepMatch[]): readonly GrepMatch[] {
  return [...matches].sort(
    (left, right) =>
      right.mtime - left.mtime || comparePaths(left.filePath, right.filePath)
  );
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
