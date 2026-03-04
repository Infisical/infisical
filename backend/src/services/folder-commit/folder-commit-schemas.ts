import { z } from "zod";

// Base schema shared by both secret and folder changes
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
  actorType: z.string(),
  message: z.string().nullable().optional(),
  folderId: z.string()
});

// Secret-specific versions schema
const secretVersionSchema = z.object({
  secretKey: z.string(),
  secretComment: z.string(),
  skipMultilineEncoding: z.boolean().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  secretValue: z.string(),
  isRedacted: z.boolean(),
  redactedAt: z.date().nullable(),
  redactedByUserId: z.string().nullable()
});

// Folder-specific versions schema
const folderVersionSchema = z.object({
  version: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional().nullable()
});

// Secret commit change schema
const secretCommitChangeSchema = baseChangeSchema.extend({
  resourceType: z.literal("secret"),
  secretVersionId: z.string().optional().nullable(),
  secretKey: z.string(),
  secretVersion: z.union([z.string(), z.number()]),
  secretId: z.string(),
  versions: z.array(secretVersionSchema).optional()
});

// Folder commit change schema
const folderCommitChangeSchema = baseChangeSchema.extend({
  resourceType: z.literal("folder"),
  folderVersionId: z.string().optional().nullable(),
  folderName: z.string(),
  folderChangeId: z.string(),
  folderVersion: z.union([z.string(), z.number()]),
  versions: z.array(folderVersionSchema).optional()
});

// Discriminated union for commit changes
export const commitChangeSchema = z.discriminatedUnion("resourceType", [
  secretCommitChangeSchema,
  folderCommitChangeSchema
]);

// Commit schema
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
  isLatest: z.boolean().default(false),
  changes: z.array(commitChangeSchema).optional()
});

// Response schema
export const commitChangesResponseSchema = z.object({
  changes: commitSchema
});

// Base resource change schema for comparison results
const baseResourceChangeSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  oldVersionId: z.string().optional(),
  changeType: z.enum(["add", "delete", "update", "create"]),
  commitId: z.union([z.string(), z.bigint()]),
  createdAt: z.union([z.string(), z.date()]).optional(),
  parentId: z.string().optional(),
  isUpdate: z.boolean().optional(),
  fromVersion: z.union([z.string(), z.number()]).optional()
});

// Secret resource change schema
const secretResourceChangeSchema = baseResourceChangeSchema.extend({
  type: z.literal("secret"),
  secretKey: z.string(),
  secretVersion: z.union([z.string(), z.number()]),
  secretId: z.string(),
  versions: z
    .array(
      z.object({
        secretKey: z.string().optional(),
        secretComment: z.string().optional(),
        skipMultilineEncoding: z.boolean().nullable().optional(),
        secretReminderRepeatDays: z.number().nullable().optional(),
        tags: z.array(z.string()).nullable().optional(),
        metadata: z.unknown().nullable().optional(),
        secretReminderNote: z.string().nullable().optional(),
        secretValue: z.string().optional(),
        isRedacted: z.boolean(),
        redactedAt: z.date().nullable(),
        redactedByUserId: z.string().nullable()
      })
    )
    .optional()
});

// Folder resource change schema
const folderResourceChangeSchema = baseResourceChangeSchema.extend({
  type: z.literal("folder"),
  folderName: z.string(),
  folderVersion: z.union([z.string(), z.number()]),
  versions: z.array(folderVersionSchema).optional()
});

// Discriminated union for resource changes
export const resourceChangeSchema = z.discriminatedUnion("type", [
  secretResourceChangeSchema,
  folderResourceChangeSchema
]);
