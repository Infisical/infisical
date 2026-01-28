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
  Cloudflare = "cloudflare",
  DNSMadeEasy = "dns-made-easy",
  AzureDNS = "azure-dns"
}

export enum CaCapability {
  ISSUE_CERTIFICATES = "issue-certificates",
  REVOKE_CERTIFICATES = "revoke-certificates",
  RENEW_CERTIFICATES = "renew-certificates"
}
