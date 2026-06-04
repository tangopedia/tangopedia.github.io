// Pure state-pattern engine. No IO, no astro imports — usable from anywhere.
//
// A "concrete state" assigns one value to each base axis. A "pattern" gives, per
// axis, a constraint: a single value, a list (any-of), undefined/`any` (wildcard),
// or the reserved keywords `same-as-entry` / `alternates` (exit only). Two figures
// are compatible when some exit state of one equals some entry state of the other.

import type { Vocab } from './vocab';

export const BASE_AXES = ['embrace', 'system', 'relative', 'follower_free_foot'] as const;
export type Axis = (typeof BASE_AXES)[number];
export type Concrete = Record<Axis, string>;
type Constraint = string | string[] | undefined;
type FlatPattern = Record<Axis, Constraint>;

function domain(vocab: Vocab, axis: Axis): string[] {
  if (axis === 'follower_free_foot') return vocab.roles.free_foot.values;
  return vocab.axes[axis].values;
}

function opposite(foot: string): string {
  return foot === 'left' ? 'right' : 'left';
}

// Collapse a figure's nested entry/exit pattern (couple axes + follower.free_foot)
// into a flat axis→constraint map.
function flatten(pattern: any): FlatPattern {
  const p = pattern ?? {};
  return {
    embrace: p.embrace,
    system: p.system,
    relative: p.relative,
    follower_free_foot: p.follower?.free_foot,
  };
}

function valuesFor(axis: Axis, c: Constraint, vocab: Vocab, entry?: Concrete): string[] {
  if (c === undefined || c === 'any') return domain(vocab, axis);
  if (c === 'same-as-entry') return entry ? [entry[axis]] : domain(vocab, axis);
  if (c === 'alternates') return entry ? [opposite(entry[axis])] : domain(vocab, axis);
  return Array.isArray(c) ? c : [c];
}

function cartesian(perAxis: Record<Axis, string[]>): Concrete[] {
  let out: Concrete[] = [{} as Concrete];
  for (const axis of BASE_AXES) {
    const next: Concrete[] = [];
    for (const partial of out) for (const v of perAxis[axis]) next.push({ ...partial, [axis]: v });
    out = next;
  }
  return out;
}

const key = (c: Concrete) => BASE_AXES.map((a) => c[a]).join('|');
const dedupe = (cs: Concrete[]) => [...new Map(cs.map((c) => [key(c), c])).values()];

/** Concrete states a figure's entry pattern accepts. */
export function entryStates(entry: any, vocab: Vocab): Concrete[] {
  const flat = flatten(entry);
  const perAxis = {} as Record<Axis, string[]>;
  for (const a of BASE_AXES) perAxis[a] = valuesFor(a, flat[a], vocab);
  return dedupe(cartesian(perAxis));
}

/** Exit states reachable from ONE specific entry concrete (threads same-as-entry/alternates). */
export function exitStatesForEntry(exit: any[], ec: Concrete, vocab: Vocab): Concrete[] {
  const out: Concrete[] = [];
  for (const ex of exit ?? []) {
    const flat = flatten(ex);
    const perAxis = {} as Record<Axis, string[]>;
    for (const a of BASE_AXES) perAxis[a] = valuesFor(a, flat[a], vocab, ec);
    out.push(...cartesian(perAxis));
  }
  return dedupe(out);
}

/** All concrete states a figure can end in, over every entry branch. */
export function exitStates(figure: any, vocab: Vocab): Concrete[] {
  const out: Concrete[] = [];
  for (const ec of entryStates(figure.entry, vocab)) out.push(...exitStatesForEntry(figure.exit, ec, vocab));
  return dedupe(out);
}

/** True iff some exit state equals some entry state (a dancer can flow straight across). */
export function compatible(exits: Concrete[], entries: Concrete[]): boolean {
  const accept = new Set(entries.map(key));
  return exits.some((c) => accept.has(key(c)));
}

/** Concrete states present in both sets (the actual hand-off states). */
export function intersect(a: Concrete[], b: Concrete[]): Concrete[] {
  const inB = new Set(b.map(key));
  return a.filter((c) => inB.has(key(c)));
}
