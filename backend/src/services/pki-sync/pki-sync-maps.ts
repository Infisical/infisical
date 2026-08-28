import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PkiSync } from "./pki-sync-enums";

export const PKI_SYNC_NAME_MAP: Record<PkiSync, string> = {
  [PkiSync.AzureKeyVault]: "Azure Key Vault",
  [PkiSync.AwsCertificateManager]: "AWS Certificate Manager",
  [PkiSync.AwsSecretsManager]: "AWS Secrets Manager",
  [PkiSync.AwsElasticLoadBalancer]: "AWS Elastic Load Balancer",
  [PkiSync.Chef]: "Chef",
  [PkiSync.CloudflareCustomCertificate]: "Cloudflare Custom SSL Certificate",
  [PkiSync.NetScaler]: "NetScaler",
  [PkiSync.F5BigIp]: "F5 BIG-IP",
  [PkiSync.KempLoadMaster]: "Kemp LoadMaster",
  [PkiSync.LinuxServer]: "Linux Server",
  [PkiSync.WindowsServer]: "Windows Server",
  [PkiSync.NutanixPrismCentral]: "Nutanix Prism Central"
};

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [PkiSync.AwsCertificateManager]: AppConnection.AWS,
  [PkiSync.AwsSecretsManager]: AppConnection.AWS,
  [PkiSync.AwsElasticLoadBalancer]: AppConnection.AWS,
  [PkiSync.Chef]: AppConnection.Chef,
  [PkiSync.CloudflareCustomCertificate]: AppConnection.Cloudflare,
  [PkiSync.NetScaler]: AppConnection.NetScaler,
  [PkiSync.F5BigIp]: AppConnection.F5BigIp,
  [PkiSync.KempLoadMaster]: AppConnection.KempLoadMaster,
  [PkiSync.LinuxServer]: AppConnection.SSH,
  [PkiSync.WindowsServer]: AppConnection.WinRM,
  [PkiSync.NutanixPrismCentral]: AppConnection.NutanixPrismCentral
};

const PKI_SYNC_ADDITIONAL_CONNECTION_MAP: Partial<Record<PkiSync, AppConnection[]>> = {
  [PkiSync.LinuxServer]: [AppConnection.LDAP],
  [PkiSync.WindowsServer]: [AppConnection.LDAP]
};

export const getPkiSyncConnectionApps = (destination: PkiSync): AppConnection[] => [
  PKI_SYNC_CONNECTION_MAP[destination],
  ...(PKI_SYNC_ADDITIONAL_CONNECTION_MAP[destination] ?? [])
];
