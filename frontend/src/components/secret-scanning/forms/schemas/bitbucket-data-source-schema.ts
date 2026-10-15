import { z } from "zod";

import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { BaseSecretScanningDataSourceSchema } from "./base-secret-scanning-data-source-schema";

export const BitbucketDataSourceSchema = z
  .object({
    type: z.literal(SecretScanningDataSource.Bitbucket),
    config: z.object({
      workspaceSlug: z.string().min(1, "Workspace Required").max(128)
    })
  })
  .merge(BaseSecretScanningDataSourceSchema({ isConnectionRequired: true }));
