import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

export const AwsSecretsManagerSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.AWSSecretsManager),
  destinationConfig: z
    .discriminatedUnion("mappingBehavior", [
      z.object({
        mappingBehavior: z.literal(AwsSecretsManagerSyncMappingBehavior.OneToOne)
      }),
      z.object({
        mappingBehavior: z.literal(AwsSecretsManagerSyncMappingBehavior.ManyToOne),
        secretName: z
          .string()
          .regex(
            /^[a-zA-Z0-9/_+=.@-]+$/,
            "Secret name must contain only alphanumeric characters and the characters /_+=.@-"
          )
          .min(1, "Secret name is required")
          .max(256, "Secret name cannot exceed 256 characters")
      })
    ])
    .and(
      z.object({
        region: z.string().min(1, "Region required")
      })
    )
});
