import { z } from "zod";

import {
  AwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema
} from "./aws-certificate-manager-pki-sync-destination-schema";
import {
  AzureKeyVaultPkiSyncDestinationSchema,
  UpdateAzureKeyVaultPkiSyncDestinationSchema
} from "./azure-key-vault-pki-sync-destination-schema";

const PkiSyncUnionSchema = z.discriminatedUnion("destination", [
  AzureKeyVaultPkiSyncDestinationSchema,
  AwsCertificateManagerPkiSyncDestinationSchema
]);

const UpdatePkiSyncUnionSchema = z.discriminatedUnion("destination", [
  UpdateAzureKeyVaultPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema
]);

export const PkiSyncFormSchema = PkiSyncUnionSchema;

export const UpdatePkiSyncFormSchema = UpdatePkiSyncUnionSchema;

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export type TUpdatePkiSyncForm = z.infer<typeof UpdatePkiSyncFormSchema>;
