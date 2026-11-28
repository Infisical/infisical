export enum DigiCertOrderStatus {
  Pending = "pending",
  Approved = "approved",
  Issued = "issued",
  Revoked = "revoked",
  Canceled = "canceled",
  Rejected = "rejected",
  Expired = "expired",
  ReissuePending = "reissue_pending"
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

export enum DigiCertRevocationRequestStatus {
  Submitted = "submitted",
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected"
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

export const DIGICERT_MAX_CERTIFICATE_VALIDITY_DAYS = 199;

export enum DigiCertDcvMethod {
  PersistentTxt = "persistent-txt"
}

export enum DigiCertDomainValidationType {
  Ov = "ov",
  Ev = "ev"
}

export enum DigiCertDomainValidationStatus {
  Active = "active",
  Pending = "pending"
}

export const DIGICERT_EV_PRODUCT_NAME_IDS = new Set([
  "ssl_ev_basic",
  "ssl_ev_plus",
  "ssl_ev_multi_domain",
  "ssl_ev_securesite",
  "ssl_ev_securesite_multi_domain",
  "ssl_ev_thawte_webserver",
  "ssl_ev_geotrust_truebizid",
  "ssl_ev_securesite_flex",
  "ssl_ev_securesite_pro"
]);

export enum DigiCertProductType {
  Ssl = "ssl_certificate"
}
