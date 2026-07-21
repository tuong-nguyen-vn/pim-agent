import type { Theme } from "@earendil-works/pi-coding-agent";
import { Paths } from "../../shared/Paths";
import { Renderer } from "../../shared/Renderer";

export type ReadTitleOutcome = {
  readonly visibleStart: number;
  readonly visibleEnd: number;
  readonly totalLines: number;
};

export type TitlePathOptions = {
  readonly path: string | undefined;
  readonly cwd: string;
  readonly start: number | undefined;
  readonly end: number | undefined;
  readonly outcome?: ReadTitleOutcome;
};

export function formatTitlePath(options: TitlePathOptions): string {
  const { path, range } = formatTitlePathParts(options);
  return `${path}${range === "" ? "" : ` ${range}`}`;
}

export function renderTitlePath(
  options: TitlePathOptions,
  theme: Theme
): string {
  const { path, range } = formatTitlePathParts(options);
  const styledPath = options.path
    ? Renderer.renderFileLink(
        theme,
        path,
        Paths.resolve(options.path, options.cwd)
      )
    : theme.fg("muted", path);
  return `${styledPath}${range === "" ? "" : ` ${theme.fg("warning", range)}`}`;
}

function formatTitlePathParts(options: TitlePathOptions): {
  readonly path: string;
  readonly range: string;
} {
  const path = options.path
    ? Paths.displayRelative(options.path, options.cwd)
    : "...";
  const range = formatRange(options.start, options.end, options.outcome);
  return { path, range };
}

function formatRange(
  start: number | undefined,
  end: number | undefined,
  outcome: ReadTitleOutcome | undefined
): string {
  if (outcome !== undefined) {
    const wholeFile =
      outcome.visibleStart === 1 && outcome.visibleEnd === outcome.totalLines;
    if (wholeFile) {
      return "";
    }
    return `@${outcome.visibleStart}-${outcome.visibleEnd}`;
  }

  if (start === undefined && end === undefined) {
    return "";
  }

  const startLine = start ?? 1;

  if (end === undefined) {
    return `@${startLine}`;
  }

  return `@${startLine}-${end}`;
}
