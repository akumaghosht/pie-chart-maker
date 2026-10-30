import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const templates = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/content/templates',
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: z.object({
    title: z.string().max(60),
    metaDescription: z.string().max(155),
    h1: z.string(),
    category: z.string(),
    presetData: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
        color: z.string().optional(),
      })
    ),
    descriptionMarkdown: z.string(),
    faqs: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .length(3),
  }),
});

export const collections = { templates };

