export enum PkiSync {
  AzureKeyVault = "azure-key-vault",
  AwsCertificateManager = "aws-certificate-manager",
  AwsSecretsManager = "aws-secrets-manager",
  AwsElasticLoadBalancer = "aws-elastic-load-balancer",
  Chef = "chef",
  GcpCertificateManager = "gcp-certificate-manager",
  CloudflareCustomCertificate = "cloudflare-custom-certificate",
  NetScaler = "netscaler",
  F5BigIp = "f5-big-ip",
  KempLoadMaster = "kemp-loadmaster",
  LinuxServer = "linux-server",
  WindowsServer = "windows-server",
  NutanixPrismCentral = "nutanix-prism-central"
}

export enum PkiSyncExportFormat {
  Pem = "pem",
  Pkcs12 = "pkcs12"
}

export enum PemCertificateExtension {
  Pem = "pem",
  Crt = "crt"
}

export enum HostCommandVariable {
  CertificatePath = "certificatePath",
  CertificateDirectory = "certificateDirectory",
  CertificateFiles = "certificateFiles",
  CommonName = "commonName",
  Pkcs12Password = "pkcs12Password"
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
