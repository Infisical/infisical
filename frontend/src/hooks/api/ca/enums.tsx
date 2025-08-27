export enum CaType {
  INTERNAL = "internal",
  ACME = "acme",
  AZURE_AD_CS = "azure-ad-cs"
}

export enum InternalCaType {
  ROOT = "root",
  INTERMEDIATE = "intermediate"
}

export enum CaStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  PENDING_CERTIFICATE = "pending-certificate"
}

export enum CaRenewalType {
  EXISTING = "existing"
}

export enum AcmeDnsProvider {
  ROUTE53 = "route53",
  Cloudflare = "cloudflare"
}

export enum AzureAdCsTemplateType {
  WEB_SERVER = "WebServer",
  COMPUTER = "Computer",
  USER = "User",
  DOMAIN_CONTROLLER = "DomainController",
  SUBORDINATE_CA = "SubordinateCA"
}

export enum AzureAdCsAuthMethod {
  CLIENT_CERTIFICATE = "client-certificate",
  KERBEROS = "kerberos"
}

export enum CaCapability {
  ISSUE_CERTIFICATES = "issue-certificates",
  REVOKE_CERTIFICATES = "revoke-certificates",
  RENEW_CERTIFICATES = "renew-certificates"
}
