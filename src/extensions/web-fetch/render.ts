import type { WebFetchResolvedFormat } from "./schema";

export type WebFetchTitleOutcome = {
  readonly format: WebFetchResolvedFormat;
  readonly totalBytes: number;
};

export function formatTitle(
  url: string | undefined,
  outcome: WebFetchTitleOutcome | undefined
): string {
  const u = url ?? "...";

  if (outcome !== undefined) {
    const label = outcome.format === "html" ? "HTML" : "Markdown";
    return `${u} (${formatSize(outcome.totalBytes)} ${label})`;
  }

  return u;
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
