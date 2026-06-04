#!/usr/bin/env node
// Cross-file build-time validator. Runs as `prebuild`, so `npm run build` (and CI)
// can never publish referentially-broken data. Collects ALL problems, prints them
// pinpointed by file, exits non-zero if any are errors. Pure Node + js-yaml.

import { readFileSync, existsSync, globSync } from 'node:fs';
import { basename } from 'node:path';
import yaml from 'js-yaml';

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const read = (p) => yaml.load(readFileSync(p, 'utf8'));
const vocab = read('src/data/state-vocabulary.yaml');
const FEET = vocab.roles.free_foot.values;
const COUPLE = { embrace: vocab.axes.embrace.values, system: vocab.axes.system.values, relative: vocab.axes.relative.values };

// ---- load figures -----------------------------------------------------------
const figureFiles = globSync('src/data/figures/**/*.yaml');
const figures = [];
for (const file of figureFiles) {
  let data;
  try {
    data = read(file);
  } catch (e) {
    err(file, `YAML parse error: ${e.message}`);
    continue;
  }
  figures.push({ file, data });
  const stem = basename(file, '.yaml');
  if (data.id !== stem) err(file, `id "${data.id}" must equal filename stem "${stem}"`);
}

const ids = new Map();
for (const { file, data } of figures) {
  if (ids.has(data.id)) err(file, `duplicate id "${data.id}" (also in ${ids.get(data.id)})`);
  else ids.set(data.id, file);
}
const has = (id) => ids.has(id);

// ---- per-axis value checking ------------------------------------------------
function checkCouple(file, where, pattern, isExit) {
  for (const axis of ['embrace', 'system', 'relative']) {
    const v = pattern?.[axis];
    if (v === undefined) continue;
    const allowed = [...COUPLE[axis], 'any', ...(isExit ? ['same-as-entry'] : [])];
    for (const one of Array.isArray(v) ? v : [v]) {
      if (!allowed.includes(one)) err(file, `${where}.${axis}: "${one}" not in vocabulary (allowed: ${allowed.join(', ')})`);
    }
  }
}
function checkFoot(file, where, foot, isExit) {
  if (foot === undefined) return;
  const allowed = [...FEET, 'any', ...(isExit ? ['same-as-entry', 'alternates'] : [])];
  for (const one of Array.isArray(foot) ? foot : [foot]) {
    if (!allowed.includes(one)) err(file, `${where}: "${one}" not a valid free_foot (allowed: ${allowed.join(', ')})`);
  }
}

// ---- main checks ------------------------------------------------------------
for (const { file, data } of figures) {
  // entry / exit presence
  if (!data.entry) err(file, 'missing entry');
  if (!Array.isArray(data.exit) || data.exit.length === 0) err(file, 'must have at least one exit');

  // state values exist in vocabulary
  checkCouple(file, 'entry', data.entry, false);
  checkFoot(file, 'entry.follower.free_foot', data.entry?.follower?.free_foot, false);
  for (const [i, ex] of (data.exit ?? []).entries()) {
    checkCouple(file, `exit[${i}]`, ex, true);
    checkFoot(file, `exit[${i}].follower.free_foot`, ex?.follower?.free_foot, true);
  }
  for (const [i, ex] of (data.executions ?? []).entries()) {
    checkFoot(file, `executions[${i}].leader.entry.free_foot`, ex.leader?.entry?.free_foot, false);
    for (const [j, le] of (ex.leader?.exit ?? []).entries())
      checkFoot(file, `executions[${i}].leader.exit[${j}].free_foot`, le?.free_foot, true);
    for (const step of ex.decomposition ?? [])
      if (step.ref && !has(step.ref)) err(file, `executions[${i}] decomposition ref "${step.ref}" is not a real figure id`);
  }

  // referential integrity
  for (const step of data.decomposition ?? [])
    if (step.ref && !has(step.ref)) err(file, `decomposition ref "${step.ref}" is not a real figure id`);
  for (const [i, r] of (data.relations ?? []).entries())
    if (!has(r.target)) err(file, `relations[${i}].target "${r.target}" is not a real figure id`);

  // clips: local files must exist; youtube needs an id
  for (const [i, c] of (data.clips ?? []).entries()) {
    if (c.type === 'local-loop' && !existsSync(`public/clips/${c.src}`)) err(file, `clips[${i}] file public/clips/${c.src} not found`);
    if (c.type === 'youtube' && !c.id) err(file, `clips[${i}] youtube clip missing id`);
  }

  // default-language content must exist
  if (!existsSync(`src/content/en/figures/${data.id}.md`)) err(data.id, `missing default-language content: src/content/en/figures/${data.id}.md`);

  // ---- warnings ----
  if (data.kind === 'figure' && !data.executions && !data.entry?.leader)
    warn(file, 'no leader detail (executions/leader) — fine for a draft, but the leader view will be empty');
  if (!existsSync(`src/content/es/figures/${data.id}.md`)) warn(data.id, 'missing es translation (falls back to en)');
  // mirror/variant reciprocity
  for (const r of data.relations ?? []) {
    if (r.type === 'mirror_of' || r.type === 'variant_of') {
      const target = figures.find((f) => f.data.id === r.target);
      const back = target?.data.relations?.some((x) => x.type === r.type && x.target === data.id);
      if (target && r.type === 'mirror_of' && !back) warn(file, `mirror_of ${r.target} is not reciprocated by ${r.target}`);
    }
  }
}

// ---- guides reference real figures -----------------------------------------
for (const file of globSync('src/data/guides/**/*.yaml')) {
  const g = read(file);
  for (const id of g.figures ?? []) if (!has(id)) err(file, `guide lists unknown figure id "${id}"`);
}

// ---- orphan clip assets -----------------------------------------------------
const referenced = new Set();
for (const { data } of figures) for (const c of data.clips ?? []) if (c.type === 'local-loop') referenced.add(c.src);
for (const f of globSync('public/clips/*.webm')) if (!referenced.has(basename(f))) warn(f, 'clip file referenced by no figure');

// ---- report -----------------------------------------------------------------
for (const w of warnings) console.warn(`⚠ ${w.where}\n    ${w.msg}`);
for (const e of errors) console.error(`✗ ${e.where}\n    ${e.msg}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${figures.length} figures.`);
if (errors.length) {
  console.error('\nBuild aborted: fix the errors above.');
  process.exit(1);
}
console.log('✓ data is valid.');
