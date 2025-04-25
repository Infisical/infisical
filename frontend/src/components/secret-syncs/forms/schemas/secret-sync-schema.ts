import { z } from "zod";

import { AwsParameterStoreSyncDestinationSchema } from "./aws-parameter-store-sync-destination-schema";
import { AwsSecretsManagerSyncDestinationSchema } from "./aws-secrets-manager-sync-destination-schema";
import { AzureAppConfigurationSyncDestinationSchema } from "./azure-app-configuration-sync-destination-schema";
import { AzureKeyVaultSyncDestinationSchema } from "./azure-key-vault-sync-destination-schema";
import { CamundaSyncDestinationSchema } from "./camunda-sync-destination-schema";
import { DatabricksSyncDestinationSchema } from "./databricks-sync-destination-schema";
import { GcpSyncDestinationSchema } from "./gcp-sync-destination-schema";
import { GitHubSyncDestinationSchema } from "./github-sync-destination-schema";
import { HCVaultSyncDestinationSchema } from "./hc-vault-sync-destination-schema";
import { HumanitecSyncDestinationSchema } from "./humanitec-sync-destination-schema";
import { TeamCitySyncDestinationSchema } from "./teamcity-sync-destination-schema";
import { TerraformCloudSyncDestinationSchema } from "./terraform-cloud-destination-schema";
import { VercelSyncDestinationSchema } from "./vercel-sync-destination-schema";
import { WindmillSyncDestinationSchema } from "./windmill-sync-destination-schema";

const SecretSyncUnionSchema = z.discriminatedUnion("destination", [
  AwsParameterStoreSyncDestinationSchema,
  AwsSecretsManagerSyncDestinationSchema,
  GitHubSyncDestinationSchema,
  GcpSyncDestinationSchema,
  AzureKeyVaultSyncDestinationSchema,
  AzureAppConfigurationSyncDestinationSchema,
  DatabricksSyncDestinationSchema,
  HumanitecSyncDestinationSchema,
  TerraformCloudSyncDestinationSchema,
  CamundaSyncDestinationSchema,
  VercelSyncDestinationSchema,
  WindmillSyncDestinationSchema,
  HCVaultSyncDestinationSchema,
  TeamCitySyncDestinationSchema
]);

export const SecretSyncFormSchema = SecretSyncUnionSchema;

export const UpdateSecretSyncFormSchema = SecretSyncUnionSchema;

export type TSecretSyncForm = z.infer<typeof SecretSyncFormSchema>;
