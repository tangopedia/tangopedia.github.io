// Astro-side loaders. Bridge content collections → plain objects for lib/graph.
import { getCollection, render, type CollectionEntry } from 'astro:content';

export type Figure = CollectionEntry<'figures'>['data'];

export async function loadFigures(): Promise<Figure[]> {
  const entries = await getCollection('figures');
  return entries.map((e) => e.data).sort((a, b) => a.id.localeCompare(b.id));
}

const DEFAULT_LANG = 'en';

/** Rendered prose for a figure, falling back from the requested language to the default. */
export async function loadContent(id: string, lang = DEFAULT_LANG) {
  const all = await getCollection('content');
  const pick = (l: string) => all.find((e) => e.id === `${l}/figures/${id}`);
  const entry = pick(lang) ?? pick(DEFAULT_LANG);
  if (!entry) return null;
  const { Content } = await render(entry);
  return { Content, data: entry.data, lang: entry.id.split('/')[0] };
}
