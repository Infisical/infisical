export enum LogProvider {
  Azure = "azure",
  Cribl = "cribl",
  Custom = "custom",
  Datadog = "datadog",
  Splunk = "splunk",
  QRadar = "qradar"
}

export enum StreamMode {
  // Legacy: one event POSTed per request. Only existing custom streams use this.
  Single = "single",
  // A JSON array of events POSTed per request. Default for all new streams.
  Batch = "batch"
}

export enum AuditLogStreamProduct {
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  KMS = "kms",
  SecretScanning = "secret-scanning",
  PAM = "pam",
  Organization = "organization"
}
