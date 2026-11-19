import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const GitLabDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.GitLab),
    config: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(GitLabDataSourceScope.Group),
        groupId: z.number(),
        groupName: z.string()
      }),
      z.object({
        scope: z.literal(GitLabDataSourceScope.Account)
      }),
      z.object({
        scope: z.literal(GitLabDataSourceScope.Project),
        projectId: z.number(),
        projectName: z.string()
      })
    ])
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: true }));
