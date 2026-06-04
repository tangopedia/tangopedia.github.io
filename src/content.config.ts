import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// Enums are GENERATED from the vocabulary so data can only ever use real values.
const vocab = yaml.load(readFileSync('src/data/state-vocabulary.yaml', 'utf8')) as any;
const tuple = (vals: string[]) => z.enum(vals as [string, ...string[]]);

const embrace = tuple(vocab.axes.embrace.values);
const system = tuple(vocab.axes.system.values);
const relative = tuple(vocab.axes.relative.values);
const foot = tuple(vocab.roles.free_foot.values);

// A per-axis constraint: a single value, a non-empty list, or a reserved keyword.
const constraint = (base: z.ZodTypeAny, keywords: [string, ...string[]]) =>
  z.union([base, z.array(base).nonempty(), z.enum(keywords)]).optional();

const coupleEntry = {
  embrace: constraint(embrace, ['any']),
  system: constraint(system, ['any']),
  relative: constraint(relative, ['any']),
};
const coupleExit = {
  embrace: constraint(embrace, ['any', 'same-as-entry']),
  system: constraint(system, ['any', 'same-as-entry']),
  relative: constraint(relative, ['any', 'same-as-entry']),
};
const footEntry = constraint(foot, ['any']);
const footExit = constraint(foot, ['any', 'same-as-entry', 'alternates']);

const entryState = z.object({ ...coupleEntry, follower: z.object({ free_foot: footEntry }).optional() });
const exitState = z.object({ ...coupleExit, follower: z.object({ free_foot: footExit }).optional() });

const clips = z
  .array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('local-loop'), src: z.string(), view: z.string().optional() }),
      z.object({
        type: z.literal('youtube'),
        id: z.string(),
        view: z.string().optional(),
        start: z.number().optional(),
        end: z.number().optional(),
      }),
    ]),
  )
  .default([]);

const execution = z.object({
  id: z.string(),
  name: z.object({ canonical: z.string() }).optional(),
  leader: z
    .object({
      entry: z.object({ free_foot: footEntry }),
      exit: z.array(z.object({ free_foot: footExit })).nonempty(),
    })
    .optional(),
  decomposition: z.array(z.object({ ref: z.string() }).passthrough()).optional(),
  clips: clips.optional(),
});

const figures = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/figures' }),
  schema: z.object({
    id: z.string(),
    kind: z.enum(['primitive', 'figure', 'sequence', 'transition']),
    name: z.object({
      canonical: z.string(),
      also: z.array(z.string()).default([]),
      spelling_variants: z.array(z.string()).default([]),
    }),
    family: z.string(),
    tags: z.array(z.string()).default([]),
    difficulty: z.number().int().min(1).max(5),
    entry: entryState,
    exit: z.array(exitState).nonempty(),
    decomposition: z.array(z.object({ ref: z.string() }).passthrough()).optional(),
    executions: z.array(execution).optional(),
    clips,
    relations: z
      .array(z.object({ type: z.enum(['variant_of', 'mirror_of', 'recommended']), target: z.string() }))
      .default([]),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/guides' }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    ordered: z.boolean().default(false),
    figures: z.array(z.string()).nonempty(),
  }),
});

const content = defineCollection({
  loader: glob({ pattern: '*/figures/*.md', base: './src/content' }),
  schema: z.object({ title: z.string().optional(), summary: z.string().optional() }),
});

export const collections = { figures, guides, content };
