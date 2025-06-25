import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

export const GitlabSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.GitLab),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(GitLabSyncScope.Project),
        projectId: z.string().trim().min(1, "Project ID required"),
        projectName: z.string().trim().min(1, "Project name required"),
        targetEnvironment: z.string().optional(),
        shouldProtectSecrets: z.boolean().optional().default(false),
        shouldMaskSecrets: z.boolean().optional().default(false),
        shouldHideSecrets: z.boolean().optional().default(false)
      }),
      z.object({
        scope: z.literal(GitLabSyncScope.Group),
        targetEnvironment: z.string().optional(),
        groupId: z.string().trim().min(1, "Group ID required"),
        groupName: z.string().trim().min(1, "Group name required"),
        shouldProtectSecrets: z.boolean().optional().default(false),
        shouldMaskSecrets: z.boolean().optional().default(false),
        shouldHideSecrets: z.boolean().optional().default(false)
      })
    ])
  })
);
