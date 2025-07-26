import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export enum NetlifySyncContext {
  All = "all",
  DeployPreview = "deploy-preview",
  Production = "production",
  BranchDeploy = "branch-deploy",
  Dev = "dev",
  Branch = "branch"
}

export const NetlifySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Netlify),
    destinationConfig: z.object({
      accountId: z.string(),
      accountName: z.string(),
      siteId: z.string().optional(),
      siteName: z.string().optional(),
      context: z.nativeEnum(NetlifySyncContext).optional().default(NetlifySyncContext.All)
    })
  })
);
