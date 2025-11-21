import { z } from "zod";

import {
  AwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema
} from "./aws-certificate-manager-pki-sync-destination-schema";
import {
  AwsSecretsManagerPkiSyncDestinationSchema,
  UpdateAwsSecretsManagerPkiSyncDestinationSchema
} from "./aws-secrets-manager-pki-sync-destination-schema";
import {
  AzureKeyVaultPkiSyncDestinationSchema,
  UpdateAzureKeyVaultPkiSyncDestinationSchema
} from "./azure-key-vault-pki-sync-destination-schema";
import {
  ChefPkiSyncDestinationSchema,
  UpdateChefPkiSyncDestinationSchema
} from "./chef-pki-sync-destination-schema";

const PkiSyncUnionSchema = z.discriminatedUnion("destination", [
  AzureKeyVaultPkiSyncDestinationSchema,
  AwsCertificateManagerPkiSyncDestinationSchema,
  AwsSecretsManagerPkiSyncDestinationSchema,
  ChefPkiSyncDestinationSchema
]);

const UpdatePkiSyncUnionSchema = z.discriminatedUnion("destination", [
  UpdateAzureKeyVaultPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsSecretsManagerPkiSyncDestinationSchema,
  UpdateChefPkiSyncDestinationSchema
]);

export const PkiSyncFormSchema = PkiSyncUnionSchema;

export const UpdatePkiSyncFormSchema = UpdatePkiSyncUnionSchema;

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export type TUpdatePkiSyncForm = z.infer<typeof UpdatePkiSyncFormSchema>;
