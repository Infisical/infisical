export enum CaType {
  INTERNAL = "internal",
  ACME = "acme"
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
  CLOUDFLARE = "cloudflare"
}
