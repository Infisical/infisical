import { z } from "zod";

import { SecretFolderRole } from "@app/db/schemas";

export const SanitizedFolderAccessSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  folderId: z.string().uuid(),
  permission: z.nativeEnum(SecretFolderRole),
  environment: z.string(),
  secretPath: z.string(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().nullable(),
  temporaryRange: z.string().nullable(),
  temporaryAccessStartTime: z.date().nullable(),
  temporaryAccessEndTime: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const SanitizedFolderAccessRoleSchema = z.object({
  id: z.string().uuid().nullable(),
  slug: z.string(),
  name: z.string()
});

export const SanitizedFolderAccessMembershipSchema = z.object({
  id: z.string().uuid().nullable(),
  isProjectAdmin: z.boolean(),
  roles: SanitizedFolderAccessRoleSchema.array()
});

export const SanitizedFolderAccessUserSchema = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  membership: SanitizedFolderAccessMembershipSchema,
  folderRBACAccess: SanitizedFolderAccessSchema.nullable()
});

export const SanitizedFolderAccessIdentitySchema = z.object({
  identityId: z.string().uuid(),
  name: z.string(),
  membership: SanitizedFolderAccessMembershipSchema,
  folderRBACAccess: SanitizedFolderAccessSchema.nullable()
});
