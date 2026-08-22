export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager",
  AwsSecretsManager = "aws-secrets-manager",
  AwsElasticLoadBalancer = "aws-elastic-load-balancer",
  Chef = "chef",
  CloudflareCustomCertificate = "cloudflare-custom-certificate",
  NetScaler = "netscaler",
  F5BigIp = "f5-big-ip",
  KempLoadMaster = "kemp-loadmaster",
  LinuxServer = "linux-server",
  WindowsServer = "windows-server",
  NutanixPrismCentral = "nutanix-prism-central"
}

export enum PkiSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum PkiSyncAction {
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates"
}

export const PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT = 3;

export const PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S = 15 * 60;

export const PKI_SYNC_CONNECTION_LOCK_RETRY = { retryCount: 10, retryDelay: 3_000, retryJitter: 500 };

export const HEALTH_CHECK_COMMAND_OPTION_KEY = "healthCheckCommand";
