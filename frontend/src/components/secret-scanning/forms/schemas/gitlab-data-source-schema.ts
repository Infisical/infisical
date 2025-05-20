import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const GitLabDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.GitLab),
    config: z.object({
      includeProjects: z.string().array().min(1, "One or more projects required")
    })
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: true }));
