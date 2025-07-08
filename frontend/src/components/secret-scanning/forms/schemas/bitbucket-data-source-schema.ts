import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const BitbucketDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.Bitbucket),
    config: z.object({
      workspaceSlug: z.string().min(1, "Workspace Required").max(128),
      includeRepos: z
        .string()
        .array()
        .min(1, "One or more repositories required")
        .max(100, "Cannot configure more than 100 repositories")
    })
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: true }));
