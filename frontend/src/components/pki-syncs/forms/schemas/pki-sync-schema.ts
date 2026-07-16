import { z } from "zod";

import { PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

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
import {
  F5BigIpPkiSyncDestinationSchema,
  UpdateF5BigIpPkiSyncDestinationSchema
} from "./f5-big-ip-pki-sync-destination-schema";
import {
  LinuxServerPkiSyncDestinationSchema,
  UpdateLinuxServerPkiSyncDestinationSchema
} from "./linux-server-pki-sync-destination-schema";
import {
  NetScalerPkiSyncDestinationSchema,
  UpdateNetScalerPkiSyncDestinationSchema
} from "./netscaler-pki-sync-destination-schema";
import {
  UpdateWindowsServerPkiSyncDestinationSchema,
  WindowsServerPkiSyncDestinationSchema
} from "./windows-server-pki-sync-destination-schema";

const PkiSyncUnionSchema = z.discriminatedUnion("destination", [
  AzureKeyVaultPkiSyncDestinationSchema,
  AwsCertificateManagerPkiSyncDestinationSchema,
  AwsElasticLoadBalancerPkiSyncDestinationSchema,
  AwsSecretsManagerPkiSyncDestinationSchema,
  ChefPkiSyncDestinationSchema,
  CloudflareCustomCertificatePkiSyncDestinationSchema,
  NetScalerPkiSyncDestinationSchema,
  F5BigIpPkiSyncDestinationSchema,
  LinuxServerPkiSyncDestinationSchema,
  WindowsServerPkiSyncDestinationSchema
]);

const UpdatePkiSyncUnionSchema = z.discriminatedUnion("destination", [
  UpdateAzureKeyVaultPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsElasticLoadBalancerPkiSyncDestinationSchema,
  UpdateAwsSecretsManagerPkiSyncDestinationSchema,
  UpdateChefPkiSyncDestinationSchema,
  UpdateCloudflareCustomCertificatePkiSyncDestinationSchema,
  UpdateNetScalerPkiSyncDestinationSchema,
  UpdateF5BigIpPkiSyncDestinationSchema,
  UpdateLinuxServerPkiSyncDestinationSchema,
  UpdateWindowsServerPkiSyncDestinationSchema
]);

export const PkiSyncFormSchema = PkiSyncUnionSchema.superRefine((data, ctx) => {
  if (
    (data.destination === PkiSync.WindowsServer || data.destination === PkiSync.LinuxServer) &&
    data.syncOptions?.exportFormat === PkiSyncExportFormat.Pkcs12 &&
    !data.credentials?.exportPassword
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["credentials", "exportPassword"],
      message: "A password is required for PKCS#12 exports"
    });
  }
});

export const UpdatePkiSyncFormSchema = UpdatePkiSyncUnionSchema;

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export type TUpdatePkiSyncForm = z.infer<typeof UpdatePkiSyncFormSchema>;
