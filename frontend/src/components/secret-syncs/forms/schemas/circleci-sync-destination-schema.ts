import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CircleCISyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.CircleCI),
    destinationConfig: z.object({
      projectSlug: z
        .string()
        .trim()
        .min(1, "Project slug is required")
        .describe("CircleCI project slug (format: vcs-slug/org-name/repo-name)"),
      projectName: z
        .string()
        .trim()
        .min(1, "Project name is required")
        .optional()
    })
  })
);
