import type { WebFetchFormat, WebFetchResolvedFormat } from "./schema";

const URL_FG = "\x1b[38;2;199;146;234m";
const FG_RESET = "\x1b[39m";

export type WebFetchTitleOutcome = {
  readonly format: WebFetchResolvedFormat;
  readonly totalBytes: number;
};

export function formatTitle(
  url: string | undefined,
  format: WebFetchFormat | undefined,
  outcome: WebFetchTitleOutcome | undefined
): string {
  const u = url ?? "...";
  const label = formatLabel(outcome?.format ?? format ?? "markdown");

  if (outcome !== undefined) {
    return `${u} (${formatSize(outcome.totalBytes)} ${label})`;
  }

  return `${u} (${label})`;
}

export function renderTitle(
  url: string | undefined,
  format: WebFetchFormat | undefined,
  outcome: WebFetchTitleOutcome | undefined,
  styleMetadata: (text: string) => string = (text) => text
): string {
  const title = formatTitle(url, format, outcome);
  if (!url) {
    return styleMetadata(title);
  }
  return `${URL_FG}${url}${FG_RESET}${styleMetadata(title.slice(url.length))}`;
}

function formatLabel(format: WebFetchResolvedFormat): string {
  return format === "html" ? "HTML" : "Markdown";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${trimZeros((bytes / 1024).toFixed(2))}KB`;
  }
  return `${trimZeros((bytes / (1024 * 1024)).toFixed(2))}MB`;
}

function trimZeros(value: string): string {
  return value.replace(/\.?0+$/u, "");
}
