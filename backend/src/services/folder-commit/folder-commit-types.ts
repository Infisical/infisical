import { z } from "zod";

const secretVersionSchema = z.object({
  secretKey: z.string(),
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
  name: z.string()
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

const secretChangeSchema = baseChangeSchema.extend({
  objectType: z.literal("secret"),
  secretVersionId: z.string(),
  folderVersionId: z.null(),
  folderName: z.null(),
  folderChangeId: z.null(),
  secretKey: z.string(),
  secretVersion: z.union([z.string(), z.number()]),
  secretId: z.string(),
  versions: z.array(secretVersionSchema).optional()
});

const folderChangeSchema = baseChangeSchema.extend({
  objectType: z.literal("folder"),
  secretVersionId: z.null(),
  folderVersionId: z.string(),
  folderName: z.string(),
  folderChangeId: z.string(),
  folderVersion: z.union([z.string(), z.number()]),
  secretKey: z.null(),
  secretId: z.null(),
  versions: z.array(folderVersionSchema).optional()
});

const commitChangeSchema = z.discriminatedUnion("objectType", [secretChangeSchema, folderChangeSchema]);

const commitSchema = z.object({
  id: z.string(),
  commitId: z.string(),
  actorMetadata: z.object({
    id: z.string(),
    name: z.string()
  }),
  actorType: z.string(),
  message: z.string().nullable(),
  folderId: z.string(),
  envId: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  changes: z.array(commitChangeSchema)
});

export const commitChangesResponseSchema = z.object({
  changes: commitSchema
});
