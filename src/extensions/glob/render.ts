import { OutputBudget } from "../../shared/OutputBudget";
import { Paths } from "../../shared/Paths";
import type { GlobMatch } from "./glob";
import type { GlobPathFormat } from "./schema";

export type RenderOutcome = {
  readonly body: string;
  readonly totalItems: number;
  readonly visibleItems: number;
  readonly truncated: boolean;
};

export type RenderOptions = {
  readonly cwd: string;
  readonly pathFormat: GlobPathFormat;
};

export function renderFiles(
  matches: readonly GlobMatch[],
  headLimit: number,
  options: RenderOptions
): RenderOutcome {
  if (matches.length === 0) {
    return {
      body: "No matches.",
      totalItems: 0,
      visibleItems: 0,
      truncated: false,
    };
  }

  const lines = matches.map((match) => formatPath(match.path, options));
  const headCapped = lines.slice(0, headLimit);
  const { visible } = OutputBudget.applyByteCap(headCapped);
  const truncated = visible.length < lines.length;

  return {
    body: visible.join("\n"),
    totalItems: lines.length,
    visibleItems: visible.length,
    truncated,
  };
}

export type TitleOptions = {
  readonly pattern: string | undefined;
  readonly path: string | undefined;
  readonly cwd: string;
  readonly baseCwd?: string;
  readonly fileCount?: number;
};

export function formatTitle(options: TitleOptions): string {
  const pattern = options.pattern ?? "...";
  const resolved =
    options.path === undefined
      ? undefined
      : Paths.resolve(options.path, options.cwd);
  const target =
    resolved === undefined || resolved === options.cwd
      ? undefined
      : Paths.displayRelative(resolved, options.cwd);
  const location = target ? ` in ${target}` : "";
  const cwdSuffix =
    options.baseCwd !== undefined && options.cwd !== options.baseCwd
      ? ` (in: ${Paths.abbreviateHome(
          Paths.displayRelative(options.cwd, options.baseCwd)
        )})`
      : "";
  const suffix =
    options.fileCount === undefined
      ? ""
      : ` (${options.fileCount} ${options.fileCount === 1 ? "file" : "files"})`;
  return `${pattern}${location}${cwdSuffix}${suffix}`;
}

function formatPath(path: string, options: RenderOptions): string {
  return options.pathFormat === "absolute"
    ? path
    : Paths.displayRelative(path, options.cwd);
}
