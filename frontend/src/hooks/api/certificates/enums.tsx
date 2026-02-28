export enum CertStatus {
  ACTIVE = "active",
  REVOKED = "revoked"
}

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1"
}

export enum CrlReason {
  UNSPECIFIED = "UNSPECIFIED",
  KEY_COMPROMISE = "KEY_COMPROMISE",
  CA_COMPROMISE = "CA_COMPROMISE",
  AFFILIATION_CHANGED = "AFFILIATION_CHANGED",
  SUPERSEDED = "SUPERSEDED",
  CESSATION_OF_OPERATION = "CESSATION_OF_OPERATION",
  CERTIFICATE_HOLD = "CERTIFICATE_HOLD",
  // REMOVE_FROM_CRL = "REMOVE_FROM_CRL",
  PRIVILEGE_WITHDRAWN = "PRIVILEGE_WITHDRAWN",
  A_A_COMPROMISE = "A_A_COMPROMISE"
}

export enum CertKeyUsage {
  DIGITAL_SIGNATURE = "digital_signature",
  KEY_ENCIPHERMENT = "key_encipherment",
  NON_REPUDIATION = "non_repudiation",
  DATA_ENCIPHERMENT = "data_encipherment",
  KEY_AGREEMENT = "key_agreement",
  KEY_CERT_SIGN = "key_cert_sign",
  CRL_SIGN = "crl_sign",
  ENCIPHER_ONLY = "encipher_only",
  DECIPHER_ONLY = "decipher_only"
}

export enum CertExtendedKeyUsage {
  CLIENT_AUTH = "client_auth",
  SERVER_AUTH = "server_auth",
  CODE_SIGNING = "code_signing",
  EMAIL_PROTECTION = "email_protection",
  TIMESTAMPING = "time_stamping",
  OCSP_SIGNING = "ocsp_signing"
}

export enum CertSource {
  Issued = "issued",
  Discovered = "discovered",
  Imported = "imported"
}

export enum CertificateRequestStatus {
  PENDING_APPROVAL = "pending_approval",
  PENDING = "pending",
  ISSUED = "issued",
  FAILED = "failed",
  REJECTED = "rejected"
}
