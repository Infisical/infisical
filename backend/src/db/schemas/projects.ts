// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const ProjectsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  autoCapitalization: z.boolean().default(true).nullable().optional(),
  orgId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TProjects = z.infer<typeof ProjectsSchema>;
export type TProjectsInsert = Omit<TProjects, TImmutableDBKeys>;
export type TProjectsUpdate = Partial<Omit<TProjects, TImmutableDBKeys>>;
