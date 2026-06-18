export enum GoDaddyProductType {
  DV_SSL = "DV_SSL"
}

export enum GoDaddyCertificateStatus {
  PendingIssuance = "PENDING_ISSUANCE",
  RenewalPendingIssuance = "RENEWAL_PENDING_ISSUANCE",
  Issued = "ISSUED",
  Current = "CURRENT",
  Revoked = "REVOKED",
  RevokedUponIssuance = "REVOKED_UPON_ISSUANCE",
  Denied = "DENIED",
  Canceled = "CANCELED",
  Expired = "EXPIRED"
}

export const GODADDY_FINAL_ISSUED_STATUSES = [
  GoDaddyCertificateStatus.Issued,
  GoDaddyCertificateStatus.Current
] as const;

export const GODADDY_TERMINAL_FAILURE_STATUSES = [
  GoDaddyCertificateStatus.Denied,
  GoDaddyCertificateStatus.Canceled,
  GoDaddyCertificateStatus.Expired,
  GoDaddyCertificateStatus.Revoked,
  GoDaddyCertificateStatus.RevokedUponIssuance
] as const;

export enum GoDaddyProcessorOutcome {
  Skipped = "skipped"
}
