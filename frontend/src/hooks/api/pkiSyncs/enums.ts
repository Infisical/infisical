export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager",
  AwsSecretsManager = "aws-secrets-manager",
  AwsElasticLoadBalancer = "aws-elastic-load-balancer",
  Chef = "chef",
  CloudflareCustomCertificate = "cloudflare-custom-certificate",
  NetScaler = "netscaler",
  F5BigIp = "f5-big-ip",
  LinuxServer = "linux-server",
  WindowsServer = "windows-server"
}

export enum PkiSyncExportFormat {
  Pem = "pem",
  Pkcs12 = "pkcs12"
}

export enum PemCertificateExtension {
  Pem = "pem",
  Crt = "crt"
}

export enum WindowsFileAccess {
  Read = "read",
  Modify = "modify",
  FullControl = "full-control"
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
