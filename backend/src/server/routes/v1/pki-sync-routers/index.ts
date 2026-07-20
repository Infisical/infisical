import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerAwsCertificateManagerPkiSyncRouter } from "./aws-certificate-manager-pki-sync-router";
import { registerAwsElasticLoadBalancerPkiSyncRouter } from "./aws-elastic-load-balancer-pki-sync-router";
import { registerAwsSecretsManagerPkiSyncRouter } from "./aws-secrets-manager-pki-sync-router";
import { registerAzureKeyVaultPkiSyncRouter } from "./azure-key-vault-pki-sync-router";
import { registerChefPkiSyncRouter } from "./chef-pki-sync-router";
import { registerCloudflareCustomCertificatePkiSyncRouter } from "./cloudflare-custom-certificate-pki-sync-router";
import { registerF5BigIpPkiSyncRouter } from "./f5-big-ip-pki-sync-router";
import { registerLinuxServerPkiSyncRouter } from "./linux-server-pki-sync-router";
import { registerNetScalerPkiSyncRouter } from "./netscaler-pki-sync-router";
import { registerNutanixPrismCentralPkiSyncRouter } from "./nutanix-prism-central-pki-sync-router";
import { registerWindowsServerPkiSyncRouter } from "./windows-server-pki-sync-router";

export * from "./pki-sync-router";

export const PKI_SYNC_REGISTER_ROUTER_MAP: Record<
  PkiSync,
  (server: FastifyZodProvider, enableOperationId?: boolean) => Promise<void>
> = {
  [PkiSync.AzureKeyVault]: registerAzureKeyVaultPkiSyncRouter,
  [PkiSync.AwsCertificateManager]: registerAwsCertificateManagerPkiSyncRouter,
  [PkiSync.AwsSecretsManager]: registerAwsSecretsManagerPkiSyncRouter,
  [PkiSync.AwsElasticLoadBalancer]: registerAwsElasticLoadBalancerPkiSyncRouter,
  [PkiSync.Chef]: registerChefPkiSyncRouter,
  [PkiSync.CloudflareCustomCertificate]: registerCloudflareCustomCertificatePkiSyncRouter,
  [PkiSync.NetScaler]: registerNetScalerPkiSyncRouter,
  [PkiSync.F5BigIp]: registerF5BigIpPkiSyncRouter,
  [PkiSync.LinuxServer]: registerLinuxServerPkiSyncRouter,
  [PkiSync.WindowsServer]: registerWindowsServerPkiSyncRouter,
  [PkiSync.NutanixPrismCentral]: registerNutanixPrismCentralPkiSyncRouter
};
