import { z } from "zod";

import { GitHubSyncDestinationSchema } from "@app/components/secret-syncs/forms/schemas/github-sync-destination-schema";
import { SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs";
import { slugSchema } from "@app/lib/schemas";

import { AwsParameterStoreSyncDestinationSchema } from "./aws-parameter-store-sync-destination-schema";

const BaseSecretSyncSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").optional(),
  connection: z.object({ name: z.string(), id: z.string().uuid() }),
  environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
  secretPath: z.string().min(1, "Secret path required"),
  syncOptions: z.object({
    initialSyncBehavior: z.nativeEnum(SecretSyncInitialSyncBehavior),
    prependPrefix: z
      .string()
      .trim()
      .transform((str) => str.toUpperCase())
      .optional(),
    appendSuffix: z
      .string()
      .trim()
      .transform((str) => str.toUpperCase())
      .optional()
  }),
  isEnabled: z.boolean()
});

// TODO: union once more supported
export const SecretSyncFormSchema = z
  .discriminatedUnion("destination", [
    AwsParameterStoreSyncDestinationSchema,
    GitHubSyncDestinationSchema
  ])
  .and(BaseSecretSyncSchema);

export type TSecretSyncForm = z.infer<typeof SecretSyncFormSchema>;
