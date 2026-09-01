import { z } from "zod";

import { PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { GCP_MAX_CERTIFICATES_PER_MAP_ENTRY } from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

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
  GcpCertificateManagerPkiSyncDestinationSchema,
  UpdateGcpCertificateManagerPkiSyncDestinationSchema
} from "./gcp-certificate-manager-pki-sync-destination-schema";
import {
  KempLoadMasterPkiSyncDestinationSchema,
  UpdateKempLoadMasterPkiSyncDestinationSchema
} from "./kemp-loadmaster-pki-sync-destination-schema";
import {
  LinuxServerPkiSyncDestinationSchema,
  UpdateLinuxServerPkiSyncDestinationSchema
} from "./linux-server-pki-sync-destination-schema";
import {
  NetScalerPkiSyncDestinationSchema,
  UpdateNetScalerPkiSyncDestinationSchema
} from "./netscaler-pki-sync-destination-schema";
import {
  NutanixPrismCentralPkiSyncDestinationSchema,
  UpdateNutanixPrismCentralPkiSyncDestinationSchema
} from "./nutanix-prism-central-pki-sync-destination-schema";
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
  GcpCertificateManagerPkiSyncDestinationSchema,
  NetScalerPkiSyncDestinationSchema,
  F5BigIpPkiSyncDestinationSchema,
  KempLoadMasterPkiSyncDestinationSchema,
  LinuxServerPkiSyncDestinationSchema,
  WindowsServerPkiSyncDestinationSchema,
  NutanixPrismCentralPkiSyncDestinationSchema
]);

const UpdatePkiSyncUnionSchema = z.discriminatedUnion("destination", [
  UpdateAzureKeyVaultPkiSyncDestinationSchema,
  UpdateAwsCertificateManagerPkiSyncDestinationSchema,
  UpdateAwsElasticLoadBalancerPkiSyncDestinationSchema,
  UpdateAwsSecretsManagerPkiSyncDestinationSchema,
  UpdateChefPkiSyncDestinationSchema,
  UpdateCloudflareCustomCertificatePkiSyncDestinationSchema,
  UpdateGcpCertificateManagerPkiSyncDestinationSchema,
  UpdateNetScalerPkiSyncDestinationSchema,
  UpdateF5BigIpPkiSyncDestinationSchema,
  UpdateKempLoadMasterPkiSyncDestinationSchema,
  UpdateLinuxServerPkiSyncDestinationSchema,
  UpdateWindowsServerPkiSyncDestinationSchema,
  UpdateNutanixPrismCentralPkiSyncDestinationSchema
]);

export const PkiSyncFormSchema = PkiSyncUnionSchema.superRefine((data, ctx) => {
  if (
    data.destination === PkiSync.GcpCertificateManager &&
    data.destinationConfig?.certificateMapBinding &&
    (data.certificateIds?.length ?? 0) > GCP_MAX_CERTIFICATES_PER_MAP_ENTRY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationConfig", "certificateMapBinding"],
      message: `Certificate map binding supports up to ${GCP_MAX_CERTIFICATES_PER_MAP_ENTRY} certificates, which is the GCP limit for one certificate map entry.`
    });
  }

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
