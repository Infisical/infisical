export enum LogProvider {
  Azure = "azure",
  Cribl = "cribl",
  Custom = "custom",
  Datadog = "datadog",
  Splunk = "splunk"
}

export enum StreamMode {
  // One event POSTed per request (legacy custom-webhook behavior).
  Single = "single",
  // A JSON array of events POSTed per request (default for all new streams).
  Batch = "batch"
}

// Products an audit log stream can be scoped to. The product-named values are kept 1:1 with
// ProjectType (src/db/schemas/models.ts) so a project's `type` maps directly to a product, plus
// an "organization" value for org-level events that don't belong to any product project.
// Used in the stream's `filters.products` list — an absent/empty list means "stream all products".
export enum AuditLogStreamProduct {
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  KMS = "kms",
  SecretScanning = "secret-scanning",
  PAM = "pam",
  // Org-level events (no associated project), e.g. SSO, org settings, user/identity management.
  Organization = "organization"
}
