import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { JenkinsSyncScope } from "@app/hooks/api/secretSyncs/types/jenkins-sync";

export const JenkinsSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Jenkins),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(JenkinsSyncScope.Global)
      }),
      z.object({
        scope: z.literal(JenkinsSyncScope.Folder),
        folderPath: z
          .string()
          .trim()
          .min(1, "Folder is required")
          .max(255)
          .refine(
            (val) =>
              val
                .split("/")
                .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
            "Invalid folder path"
          )
      })
    ])
  })
);
