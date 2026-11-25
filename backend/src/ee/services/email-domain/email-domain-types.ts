import { TOrgPermission } from "@app/lib/types";

export enum EmailDomainStatus {
  Pending = "pending",
  Verified = "verified",
  Expired = "expired"
}

// Clients branch on these names (the Terraform provider retries on the DNS ones), so treat renames as breaking.
export enum EmailDomainVerificationError {
  DnsLookupFailed = "EMAIL_DOMAIN_DNS_LOOKUP_FAILED",
  DnsRecordMismatch = "EMAIL_DOMAIN_DNS_RECORD_MISMATCH",
  VerificationExpired = "EMAIL_DOMAIN_VERIFICATION_EXPIRED",
  PlanRestricted = "EMAIL_DOMAIN_PLAN_RESTRICTED",
  AlreadyVerified = "EMAIL_DOMAIN_ALREADY_VERIFIED"
}

// Clients branch on this name (the Terraform provider hints at domain verification), so treat renames as breaking.
export enum SsoEmailDomainError {
  NotVerified = "SSO_EMAIL_DOMAIN_NOT_VERIFIED"
}

export type TCreateEmailDomainDTO = {
  domain: string;
} & TOrgPermission;

export type TVerifyEmailDomainDTO = {
  emailDomainId: string;
} & TOrgPermission;

export type TListEmailDomainsDTO = TOrgPermission;

export type TDeleteEmailDomainDTO = {
  emailDomainId: string;
} & TOrgPermission;
