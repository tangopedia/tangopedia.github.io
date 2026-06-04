import type { APIRoute } from 'astro';
import { loadFigures } from '../lib/figures';

// Build-emitted client search index. Lazy-loaded by the search box.
export const GET: APIRoute = async () => {
  const figures = await loadFigures();
  const index = figures.map((f) => ({
    id: f.id,
    canonical: f.name.canonical,
    also: f.name.also ?? [],
    family: f.family,
    tags: f.tags ?? [],
    difficulty: f.difficulty,
    kind: f.kind,
  }));
  return new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } });
};
