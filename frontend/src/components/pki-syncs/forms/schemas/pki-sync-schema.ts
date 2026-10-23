import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { isKeystoreExportFormat, PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
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
  ExportPasswordSchema,
  KEYSTORE_PASSWORD_REQUIRED_MESSAGE,
  KeystoreAliasSchema
} from "./base-pki-sync-schema";
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
  PaloAltoNetworksDestinationSchemas,
  PaloAltoNetworksSslTlsProfileDestinationSchemas
} from "./palo-alto-networks-pki-sync-destination-schema";
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
  PaloAltoNetworksDestinationSchemas.createSchema,
  PaloAltoNetworksSslTlsProfileDestinationSchemas.createSchema,
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
  PaloAltoNetworksDestinationSchemas.updateSchema,
  PaloAltoNetworksSslTlsProfileDestinationSchemas.updateSchema,
  UpdateF5BigIpPkiSyncDestinationSchema,
  UpdateKempLoadMasterPkiSyncDestinationSchema,
  UpdateLinuxServerPkiSyncDestinationSchema,
  UpdateWindowsServerPkiSyncDestinationSchema,
  UpdateNutanixPrismCentralPkiSyncDestinationSchema
]);

const refineTargetHost = (data: unknown, ctx: z.RefinementCtx) => {
  const { connection, destinationConfig } = data as {
    connection?: { app?: AppConnection };
    destinationConfig?: { host?: string };
  };

  if (!connection?.app) return;

  if (connection.app === AppConnection.LDAP && !destinationConfig?.host) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationConfig", "host"],
      message: "A target host is required when using an LDAP connection"
    });
    return;
  }

  if (connection.app !== AppConnection.LDAP && destinationConfig?.host) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationConfig", "host"],
      message: "A target host cannot be set when the connection already targets a single host"
    });
  }
};

const isServerDestination = (destination: PkiSync) =>
  destination === PkiSync.WindowsServer || destination === PkiSync.LinuxServer;

type TKeystoreFieldIssue = {
  path: ["credentials", "exportPassword"] | ["syncOptions", "keystoreAlias"];
  message: string;
};

// Values left behind after switching to PEM are not checked, since only keystore formats use them.
export const getKeystoreFieldIssues = (
  data: { destination?: PkiSync; syncOptions?: unknown; credentials?: unknown },
  { requirePassword }: { requirePassword: boolean }
): TKeystoreFieldIssue[] => {
  const { exportFormat, keystoreAlias } = (data.syncOptions ?? {}) as {
    exportFormat?: PkiSyncExportFormat;
    keystoreAlias?: string;
  };
  if (!data.destination || !isServerDestination(data.destination)) return [];
  if (!isKeystoreExportFormat(exportFormat)) return [];

  const issues: TKeystoreFieldIssue[] = [];
  const password = (data.credentials as { exportPassword?: string } | undefined)?.exportPassword;
  if (!password) {
    if (requirePassword) {
      issues.push({
        path: ["credentials", "exportPassword"],
        message: KEYSTORE_PASSWORD_REQUIRED_MESSAGE
      });
    }
  } else {
    const result = ExportPasswordSchema.safeParse(password);
    if (!result.success) {
      issues.push({
        path: ["credentials", "exportPassword"],
        message: result.error.issues[0]?.message ?? "Invalid export password"
      });
    }
  }
  if (keystoreAlias) {
    const result = KeystoreAliasSchema.safeParse(keystoreAlias);
    if (!result.success) {
      issues.push({
        path: ["syncOptions", "keystoreAlias"],
        message: result.error.issues[0]?.message ?? "Invalid keystore alias"
      });
    }
  }
  return issues;
};

const refineKeystoreFields = (
  data: { destination: PkiSync; syncOptions?: unknown; credentials?: unknown },
  ctx: z.RefinementCtx,
  options: { requirePassword: boolean }
) => {
  getKeystoreFieldIssues(data, options).forEach(({ path, message }) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })
  );
};

// Drops keystore options the chosen format does not use, since the API rejects them.
export const removeUnusedKeystoreOptions = <
  T extends { syncOptions?: unknown; credentials?: unknown }
>(
  data: T
): T => {
  if (!data.syncOptions) return data;
  const syncOptions = { ...(data.syncOptions as Record<string, unknown>) };
  const alias =
    typeof syncOptions.keystoreAlias === "string" ? syncOptions.keystoreAlias.trim() : "";
  const exportFormat = syncOptions.exportFormat as PkiSyncExportFormat | undefined;
  if (!isKeystoreExportFormat(exportFormat) || !alias) delete syncOptions.keystoreAlias;
  else syncOptions.keystoreAlias = alias;
  if (exportFormat !== PkiSyncExportFormat.Jks) delete syncOptions.includeTruststore;
  if (!isKeystoreExportFormat(exportFormat))
    return { ...data, syncOptions, credentials: undefined };
  return { ...data, syncOptions };
};

export const PkiSyncFormSchema = PkiSyncUnionSchema.superRefine((data, ctx) => {
  if (
    data.destination === PkiSync.GcpCertificateManager &&
    data.destinationConfig?.certificateMapBinding &&
    (data.filters?.certificateOrderIds?.length ?? 0) > GCP_MAX_CERTIFICATES_PER_MAP_ENTRY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destinationConfig", "certificateMapBinding"],
      message: `Certificate map binding supports up to ${GCP_MAX_CERTIFICATES_PER_MAP_ENTRY} certificate orders, which is the GCP limit for one certificate map entry.`
    });
  }

  refineKeystoreFields(data, ctx, { requirePassword: true });
  refineTargetHost(data, ctx);
});

export const UpdatePkiSyncFormSchema = UpdatePkiSyncUnionSchema.superRefine((data, ctx) => {
  refineKeystoreFields(data, ctx, { requirePassword: false });
  refineTargetHost(data, ctx);
});

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export type TUpdatePkiSyncForm = z.infer<typeof UpdatePkiSyncFormSchema>;
