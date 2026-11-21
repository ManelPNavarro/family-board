export function searchKey(title) {
  return title.trim().toLocaleLowerCase('ca').normalize('NFD').replace(/\p{M}/gu, '');
}

export function grocerySuggestions(draft, history, pendingItems) {
  const query = searchKey(draft);
  if (!query) return [];

  const seen = new Set(pendingItems.map(({ title }) => searchKey(title)));
  const exactDraft = draft.trim().toLocaleLowerCase('ca');
  const startsWith = [];
  const contains = [];

  for (const title of history) {
    const key = searchKey(title);
    if (!key.includes(query) || seen.has(key) || title.toLocaleLowerCase('ca') === exactDraft) {
      continue;
    }
    seen.add(key);
    (key.startsWith(query) ? startsWith : contains).push(title);
  }

  return [...startsWith, ...contains].slice(0, 5);
}
