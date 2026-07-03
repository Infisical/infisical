import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GiteaSyncScope } from "@app/hooks/api/secretSyncs/types/gitea-sync";

import { BaseSecretSyncSchema } from "./base-secret-sync-schema";

export const GiteaSyncDestinationSchema = BaseSecretSyncSchema().extend({
  destination: z.literal(SecretSync.Gitea),
  destinationConfig: z.discriminatedUnion("scope", [
    z.object({
      scope: z.literal(GiteaSyncScope.Organization),
      org: z.string().trim().min(1, "Organization name required")
    }),
    z.object({
      scope: z.literal(GiteaSyncScope.Repository),
      repo: z.string().trim().min(1, "Repository name required"),
      owner: z.string().trim().min(1, "Repository owner name required")
    })
  ])
});
