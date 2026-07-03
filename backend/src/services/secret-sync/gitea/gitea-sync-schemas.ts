import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SecretSync } from "../secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

export const Gitea;

export const GiteaSyncListItemSchema = z
  .object({
    name: z.literal("Gitea"),
    connection: z.literal(AppConnection.Gitea),
    destination: z.literal(SecretSync.Gitea),
    canRemoveSecretsOnDeletion: z.literal(true),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Gitea] }));
