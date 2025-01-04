export enum CertStatus {
  ACTIVE = "active",
  REVOKED = "revoked"
}

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
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
  DIGITAL_SIGNATURE = "digitalSignature",
  KEY_ENCIPHERMENT = "keyEncipherment",
  NON_REPUDIATION = "nonRepudiation",
  DATA_ENCIPHERMENT = "dataEncipherment",
  KEY_AGREEMENT = "keyAgreement",
  KEY_CERT_SIGN = "keyCertSign",
  CRL_SIGN = "cRLSign",
  ENCIPHER_ONLY = "encipherOnly",
  DECIPHER_ONLY = "decipherOnly"
}

export enum CertExtendedKeyUsage {
  CLIENT_AUTH = "clientAuth",
  SERVER_AUTH = "serverAuth",
  CODE_SIGNING = "codeSigning",
  EMAIL_PROTECTION = "emailProtection",
  TIMESTAMPING = "timeStamping",
  OCSP_SIGNING = "ocspSigning"
}
