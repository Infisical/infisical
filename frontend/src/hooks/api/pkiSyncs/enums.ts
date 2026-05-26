export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager",
  AwsSecretsManager = "aws-secrets-manager",
  AwsElasticLoadBalancer = "aws-elastic-load-balancer",
  Chef = "chef",
  CloudflareCustomCertificate = "cloudflare-custom-certificate",
  NetScaler = "netscaler",
  F5BigIp = "f5-big-ip",
  NutanixPrismCentral = "nutanix-prism-central"
}

export enum PkiSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum CertificateSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}
