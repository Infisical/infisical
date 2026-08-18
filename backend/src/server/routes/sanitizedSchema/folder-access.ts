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
