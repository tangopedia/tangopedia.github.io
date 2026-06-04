// Pure graph builder. Derives the two-tier edge set from state compatibility and
// merges in authored relations. Consumed by every renderer; never assumes the
// whole graph is rendered at once — callers pull a node's adjacency.

import type { Vocab } from './vocab';
import { entryStates, exitStates, exitStatesForEntry, compatible, intersect, type Concrete } from './state';

export type RelationType = 'variant_of' | 'mirror_of' | 'recommended';
export type Edge =
  | { kind: 'direct'; from: string; to: string }
  | { kind: 'bridged'; from: string; to: string; via: string }
  | { kind: 'relation'; from: string; to: string; relation: RelationType };

export interface NodeSummary {
  id: string;
  kind: string;
  canonical: string;
  family: string;
  tags: string[];
  difficulty: number;
}

export interface Adjacency {
  leadsTo: Array<{ to: string; via?: string }>; // outgoing direct (via undefined) + bridged
  comesFrom: Array<{ from: string; via?: string }>; // incoming direct + bridged
  related: Array<{ to: string; relation: RelationType }>;
}

export interface Graph {
  nodes: NodeSummary[];
  edges: Edge[];
  adjacency: Record<string, Adjacency>;
  facets: { family: Record<string, string[]>; difficulty: Record<string, string[]>; tag: Record<string, string[]> };
}

export function buildGraph(figures: any[], vocab: Vocab): Graph {
  const ids = new Set(figures.map((f) => f.id));
  const exits = new Map<string, Concrete[]>(figures.map((f) => [f.id, exitStates(f, vocab)]));
  const entries = new Map<string, Concrete[]>(figures.map((f) => [f.id, entryStates(f.entry, vocab)]));
  const primitives = figures.filter((f) => f.kind === 'primitive');

  const edges: Edge[] = [];
  for (const a of figures) {
    for (const b of figures) {
      if (a.id === b.id) continue;
      if (compatible(exits.get(a.id)!, entries.get(b.id)!)) {
        edges.push({ kind: 'direct', from: a.id, to: b.id });
        continue;
      }
      // Otherwise: can ONE primitive bridge the gap? ("adapt a little")
      // A real bridge must THREAD a concrete state: A hands a state to P, and P's
      // transformation of THAT state must be one B accepts. (A primitive that
      // preserves the foot can't fix a foot mismatch.)
      const via = primitives
        .filter((p) => {
          if (p.id === a.id || p.id === b.id) return false;
          const handoff = intersect(exits.get(a.id)!, entries.get(p.id)!);
          return handoff.some((s) => compatible(exitStatesForEntry(p.exit, s, vocab), entries.get(b.id)!));
        })
        .sort((x, y) => x.difficulty - y.difficulty)[0];
      if (via) edges.push({ kind: 'bridged', from: a.id, to: b.id, via: via.id });
    }
    for (const r of a.relations ?? []) {
      if (ids.has(r.target)) edges.push({ kind: 'relation', from: a.id, to: r.target, relation: r.type });
    }
  }

  // Deterministic order → stable build output / clean diffs.
  const rank = { direct: 0, bridged: 1, relation: 2 } as const;
  edges.sort((e1, e2) => e1.from.localeCompare(e2.from) || e1.to.localeCompare(e2.to) || rank[e1.kind] - rank[e2.kind]);

  const nodes: NodeSummary[] = figures
    .map((f) => ({ id: f.id, kind: f.kind, canonical: f.name.canonical, family: f.family, tags: f.tags ?? [], difficulty: f.difficulty }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const adjacency: Record<string, Adjacency> = {};
  for (const f of figures) adjacency[f.id] = { leadsTo: [], comesFrom: [], related: [] };
  for (const e of edges) {
    if (e.kind === 'relation') {
      adjacency[e.from].related.push({ to: e.to, relation: e.relation });
    } else {
      const via = e.kind === 'bridged' ? e.via : undefined;
      adjacency[e.from].leadsTo.push({ to: e.to, via });
      adjacency[e.to].comesFrom.push({ from: e.from, via });
    }
  }

  const facets = { family: {} as Record<string, string[]>, difficulty: {} as Record<string, string[]>, tag: {} as Record<string, string[]> };
  for (const n of nodes) {
    (facets.family[n.family] ??= []).push(n.id);
    (facets.difficulty[String(n.difficulty)] ??= []).push(n.id);
    for (const t of n.tags) (facets.tag[t] ??= []).push(n.id);
  }

  return { nodes, edges, adjacency, facets };
}
