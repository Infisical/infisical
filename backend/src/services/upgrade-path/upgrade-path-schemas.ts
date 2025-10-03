import RE2 from "re2";
import { z } from "zod";

export const versionSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(new RE2(/^[a-zA-Z0-9._/-]+$/), "Invalid version format");

export const breakingChangeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  action: z.string().min(1).max(500)
});

export const versionConfigSchema = z.object({
  breaking_changes: z.array(breakingChangeSchema).optional(),
  db_schema_changes: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional()
});

export const upgradePathConfigSchema = z.object({
  versions: z.record(versionSchema, versionConfigSchema).optional().nullable()
});
