import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AwsParameterStoreSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.AWSParameterStore),
  destinationConfig: z.object({
    path: z
      .string()
      .min(1, "Parameter Store Path required")
      .superRefine((val, ctx) => {
        if (!/^\/([/]|(([\w-]+\/)+))?$/.test(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid path - must follow "/example/path/" format'
          });
        }

        if (val.length > 2048) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot exceed 2048 characters"
          });
        }
      }),
    region: z.string().min(1, "Region required")
  })
});
