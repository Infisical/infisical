import { z } from "zod";

import {
  AwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema
} from "./aws-certificate-manager-pki-sync-destination-schema";
import {
  AwsElasticLoadBalancerPkiSyncDestinationSchema,
  UpdateAwsElasticLoadBalancerPkiSyncDestinationSchema
} from "./aws-elastic-load-balancer-pki-sync-destination-schema";
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
import {
  CloudflareCustomCertificatePkiSyncDestinationSchema,
  UpdateCloudflareCustomCertificatePkiSyncDestinationSchema
} from "./cloudflare-custom-certificate-pki-sync-destination-schema";

const PkiSyncUnionSchema = z.discriminatedUnion("destination", [
  AzureKeyVaultPkiSyncDestinationSchema,
  AwsCertificateManagerPkiSyncDestinationSchema,
  AwsElasticLoadBalancerPkiSyncDestinationSchema,
  AwsSecretsManagerPkiSyncDestinationSchema,
  ChefPkiSyncDestinationSchema,
  CloudflareCustomCertificatePkiSyncDestinationSchema
]);

const UpdatePkiSyncUnionSchema = z.discriminatedUnion("destination", [
  UpdateAzureKeyVaultPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsElasticLoadBalancerPkiSyncDestinationSchema,
  UpdateAwsSecretsManagerPkiSyncDestinationSchema,
  UpdateChefPkiSyncDestinationSchema,
  UpdateCloudflareCustomCertificatePkiSyncDestinationSchema
]);

export const PkiSyncFormSchema = PkiSyncUnionSchema;

export const UpdatePkiSyncFormSchema = UpdatePkiSyncUnionSchema;

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export type TUpdatePkiSyncForm = z.infer<typeof UpdatePkiSyncFormSchema>;
