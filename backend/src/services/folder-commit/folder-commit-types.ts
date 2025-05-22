import { z } from "zod";

const secretVersionSchema = z.object({
  secretKey: z.string().optional().nullable(),
  secretComment: z.string().optional().nullable(),
  skipMultilineEncoding: z.boolean().optional().nullable(),
  secretReminderRepeatDays: z.number().optional().nullable(),
  secretReminderNote: z.string().optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  secretReminderRecipients: z.array(z.any()).optional().nullable(),
  secretValue: z.string().optional().nullable()
});

const folderVersionSchema = z.object({
  name: z.string().optional().nullable()
});

const baseChangeSchema = z.object({
  id: z.string(),
  folderCommitId: z.string(),
  changeType: z.string(),
  isUpdate: z.boolean().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  actorMetadata: z
    .union([
      z.object({
        id: z.string().optional(),
        name: z.string().optional()
      }),
      z.unknown()
    ])
    .optional(),
  actorType: z.string().optional(),
  message: z.string().optional().nullable(),
  folderId: z.string().optional()
});

const commitChangeSchema = baseChangeSchema.extend({
  secretVersionId: z.string().optional().nullable(),
  folderVersionId: z.string().optional().nullable(),
  folderName: z.string().optional().nullable(),
  folderChangeId: z.string().optional().nullable(),
  secretKey: z.string().optional().nullable(),
  secretVersion: z.union([z.string(), z.number()]).optional().nullable(),
  secretId: z.string().optional().nullable(),
  folderVersion: z.union([z.string(), z.number()]).optional().nullable(),
  versions: z.array(z.union([secretVersionSchema, folderVersionSchema])).optional()
});

const commitSchema = z.object({
  id: z.string(),
  commitId: z.string(),
  actorMetadata: z
    .union([
      z.object({
        id: z.string().optional(),
        name: z.string().optional()
      }),
      z.unknown()
    ])
    .optional(),
  actorType: z.string(),
  message: z.string().nullable().optional(),
  folderId: z.string(),
  envId: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  changes: z.array(commitChangeSchema).optional()
});

export const commitChangesResponseSchema = z.object({
  changes: commitSchema
});
