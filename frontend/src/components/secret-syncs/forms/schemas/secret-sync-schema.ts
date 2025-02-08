import { z } from "zod";

import { AwsSecretsManagerSyncDestinationSchema } from "@app/components/secret-syncs/forms/schemas/aws-secrets-manager-sync-destination-schema";
import { GitHubSyncDestinationSchema } from "@app/components/secret-syncs/forms/schemas/github-sync-destination-schema";
import { SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs";
import { slugSchema } from "@app/lib/schemas";

import { AwsParameterStoreSyncDestinationSchema } from "./aws-parameter-store-sync-destination-schema";
import { AzureAppConfigurationSyncDestinationSchema } from "./azure-app-configuration-sync-destination-schema";
import { AzureKeyVaultSyncDestinationSchema } from "./azure-key-vault-sync-destination-schema";
import { GcpSyncDestinationSchema } from "./gcp-sync-destination-schema";

const BaseSecretSyncSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").optional(),
  connection: z.object({ name: z.string(), id: z.string().uuid() }),
  environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
  secretPath: z.string().min(1, "Secret path required"),
  syncOptions: z.object({
    initialSyncBehavior: z.nativeEnum(SecretSyncInitialSyncBehavior)
    // scott: removed temporarily for evaluation of template formatting
    // prependPrefix: z
    //   .string()
    //   .trim()
    //   .transform((str) => str.toUpperCase())
    //   .optional(),
    // appendSuffix: z
    //   .string()
    //   .trim()
    //   .transform((str) => str.toUpperCase())
    //   .optional()
  }),
  isAutoSyncEnabled: z.boolean()
});

const SecretSyncUnionSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncDestinationSchema,
  AwsSecretsManagerSyncDestinationSchema,
  GitHubSyncDestinationSchema,
  GcpSyncDestinationSchema,
  AzureKeyVaultSyncDestinationSchema,
  AzureAppConfigurationSyncDestinationSchema
]);

export const SecretSyncFormSchema = SecretSyncUnionSchema.and(BaseSecretSyncSchema);

export const UpdateSecretSyncFormSchema = SecretSyncUnionSchema.and(BaseSecretSyncSchema.partial());

export type TSecretSyncForm = z.infer<typeof SecretSyncFormSchema>;
