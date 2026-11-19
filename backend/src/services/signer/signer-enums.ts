export enum SignerStatus {
  Pending = "pending",
  Active = "active",
  Failed = "failed",
  Disabled = "disabled",
  Expired = "expired",
  RevocationPending = "revocation_pending",
  Revoked = "revoked"
}

export const isSignerRevokedOrRevoking = (status: string | null | undefined) =>
  status === SignerStatus.Revoked || status === SignerStatus.RevocationPending;

export enum SigningOperationStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
  Denied = "denied"
}

export enum SignerIssuanceJobStatus {
  Pending = "pending",
  Cancelling = "cancelling",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled"
}

export const SIGNER_CERTIFICATE_REQUEST_STATUSES = [
  SignerIssuanceJobStatus.Pending,
  SignerIssuanceJobStatus.Completed,
  SignerIssuanceJobStatus.Failed,
  SignerIssuanceJobStatus.Cancelled
] as const;

export type TSignerCertificateRequestStatus = (typeof SIGNER_CERTIFICATE_REQUEST_STATUSES)[number];

export const POLLED_SIGNER_ISSUANCE_JOB_STATUSES = [
  SignerIssuanceJobStatus.Pending,
  SignerIssuanceJobStatus.Cancelling
];

export enum SignerIssuanceJobCancelReason {
  Superseded = "superseded",
  Revoked = "revoked",
  Deleted = "deleted"
}

export enum SignerRevocationStatus {
  Submitting = "submitting",
  AwaitingApproval = "awaiting_approval",
  Completed = "completed",
  Rejected = "rejected",
  Failed = "failed"
}

export const UNSETTLED_SIGNER_REVOCATION_STATUSES = [
  SignerRevocationStatus.Submitting,
  SignerRevocationStatus.AwaitingApproval,
  SignerRevocationStatus.Failed
] as const;

export enum SignerAutoRenewalOutcome {
  Renewed = "renewed",
  Skipped = "skipped",
  Failed = "failed"
}

export type TUnsettledSignerRevocationStatus = (typeof UNSETTLED_SIGNER_REVOCATION_STATUSES)[number];

export enum DigiCertLifecycleMode {
  Renew = "renew",
  Reissue = "reissue"
}

export enum CertKeySource {
  Infisical = "infisical",
  Hsm = "hsm",
  AwsKms = "aws-kms"
}

export enum HsmKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECC_P256 = "ECC_P256",
  ECC_P384 = "ECC_P384",
  ML_DSA_44 = "ML_DSA_44",
  ML_DSA_65 = "ML_DSA_65",
  ML_DSA_87 = "ML_DSA_87"
}

export const SIGNER_APPROVAL_REQUIRED_ERROR_NAME = "ApprovalRequired";
