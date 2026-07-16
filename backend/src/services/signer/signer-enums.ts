export enum SignerStatus {
  Pending = "pending",
  Active = "active",
  Failed = "failed",
  Disabled = "disabled",
  Expired = "expired"
}

export enum SigningOperationStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
  Denied = "denied"
}

export enum SignerIssuanceJobStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed"
}

export enum CertKeySource {
  Infisical = "infisical",
  Hsm = "hsm"
}

export enum HsmKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_4096 = "RSA_4096",
  ECC_P256 = "ECC_P256",
  ECC_P384 = "ECC_P384"
}
