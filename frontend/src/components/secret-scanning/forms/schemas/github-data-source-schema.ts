import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const GitHubDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.GitHub),
    config: z.object({
      includeRepos: z.string().array()
    })
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: true }));
