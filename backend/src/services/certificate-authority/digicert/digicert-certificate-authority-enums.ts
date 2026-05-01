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
