import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
  FuzzyMatcher,
  type FuzzyCandidate,
  type FuzzyIndex,
} from "../../shared/FuzzyMatcher";

let cachedKey: string | undefined;
let cachedIndex: FuzzyIndex<AutocompleteItem> | undefined;

function keyFor(items: readonly AutocompleteItem[]): string {
  return `${items.length}\0${items.map((item) => item.value).join("\0")}`;
}

export function rank(
  query: string,
  items: readonly AutocompleteItem[],
  options: { readonly limit?: number } = {}
): AutocompleteItem[] {
  const key = keyFor(items);

  if (cachedIndex === undefined || cachedKey !== key) {
    const candidates: FuzzyCandidate<AutocompleteItem>[] = items.map(
      (item) => ({
        item,
        haystacks: [item.label, item.description ?? ""],
      })
    );
    cachedIndex = FuzzyMatcher.prepare(candidates);
    cachedKey = key;
  }

  const hits = cachedIndex.find(query, options);

  return hits.map((hit) => hit.item);
}
