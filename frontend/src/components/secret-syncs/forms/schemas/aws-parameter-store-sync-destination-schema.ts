import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AwsParameterStoreSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.AWSParameterStore),
  destinationConfig: z.object({
    path: z
      .string()
      .trim()
      .min(1, "Parameter Store Path required")
      .max(2048, "Cannot exceed 2048 characters")
      .regex(/^\/([/]|(([\w-]+\/)+))?$/, 'Invalid path - must follow "/example/path/" format'),
    region: z.string().min(1, "Region required")
  })
});
