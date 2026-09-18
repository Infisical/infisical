export enum DigiCertOrderStatus {
  Pending = "pending",
  Approved = "approved",
  Issued = "issued",
  Revoked = "revoked",
  Canceled = "canceled",
  Rejected = "rejected",
  Expired = "expired"
}

export const DIGICERT_FINAL_ISSUED_STATUSES = [DigiCertOrderStatus.Issued] as const;

export enum DigiCertProcessorOutcome {
  Skipped = "skipped"
}

export enum DigiCertPollOutcome {
  Issued = "issued",
  Pending = "pending",
  Failed = "failed"
}

export enum CodeSigningOrderStatus {
  Pending = "pending",
  NeedsApproval = "needs_approval",
  Processing = "processing",
  Issued = "issued",
  Rejected = "rejected",
  Canceled = "canceled",
  Expired = "expired",
  Revoked = "revoked"
}
