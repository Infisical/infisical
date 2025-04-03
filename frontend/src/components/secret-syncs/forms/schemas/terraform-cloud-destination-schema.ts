import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { TerraformCloudSyncScope } from "@app/hooks/api/appConnections/terraform-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TerraformCloudSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.TerraformCloud),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(TerraformCloudSyncScope.Project),
        org: z.string().trim().min(1, "Organization required"),
        project: z.string().trim().min(1, "Project required")
      }),
      z.object({
        scope: z.literal(TerraformCloudSyncScope.Workspace),
        org: z.string().trim().min(1, "Organization required"),
        workspace: z.string().trim().min(1, "Workspace required")
      })
    ])
  })
);
