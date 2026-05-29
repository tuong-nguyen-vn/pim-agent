import { DEFAULT_NUM_RESULTS } from "./schema";

export function formatTitle(
  query: string | undefined,
  n: number | undefined = DEFAULT_NUM_RESULTS
): string {
  const q = query ?? "...";
  return `${q} (${n})`;
}
