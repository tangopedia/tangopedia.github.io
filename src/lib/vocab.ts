import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// Loaded at build time (Node context during static generation). Do NOT import from client scripts.
export interface Vocab {
  axes: Record<string, { description?: string; values: string[] }>;
  roles: Record<string, { description?: string; values: string[] }>;
  keywords: Record<string, string>;
}

let cached: Vocab | null = null;
export function loadVocab(): Vocab {
  if (!cached) cached = yaml.load(readFileSync('src/data/state-vocabulary.yaml', 'utf8')) as Vocab;
  return cached;
}
