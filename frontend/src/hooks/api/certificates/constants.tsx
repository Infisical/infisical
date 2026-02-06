import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  CrlReason
} from "./enums";

export const certStatusToNameMap: { [K in CertStatus]: string } = {
  [CertStatus.ACTIVE]: "Active",
  [CertStatus.REVOKED]: "Revoked"
};

export const getCertStatusBadgeVariant = (status: CertStatus) => {
  switch (status) {
    case CertStatus.ACTIVE:
      return "success";
    case CertStatus.REVOKED:
      return "danger";
    default:
      return "primary";
  }
};

export const certKeyAlgorithmToNameMap: { [K in CertKeyAlgorithm]: string } = {
  [CertKeyAlgorithm.RSA_2048]: "RSA 2048",
  [CertKeyAlgorithm.RSA_3072]: "RSA 3072",
  [CertKeyAlgorithm.RSA_4096]: "RSA 4096",
  [CertKeyAlgorithm.ECDSA_P256]: "ECDSA P256",
  [CertKeyAlgorithm.ECDSA_P384]: "ECDSA P384"
};

export const certSignatureAlgorithmToNameMap: Record<string, string> = {
  "RSA-SHA256": "RSA with SHA-256",
  "RSA-SHA384": "RSA with SHA-384",
  "RSA-SHA512": "RSA with SHA-512",
  "ECDSA-SHA256": "ECDSA with SHA-256",
  "ECDSA-SHA384": "ECDSA with SHA-384",
  "ECDSA-SHA512": "ECDSA with SHA-512"
};

export const certKeyAlgorithms = [
  { label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.RSA_2048], value: CertKeyAlgorithm.RSA_2048 },
  { label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.RSA_3072], value: CertKeyAlgorithm.RSA_3072 },
  { label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.RSA_4096], value: CertKeyAlgorithm.RSA_4096 },
  {
    label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.ECDSA_P256],
    value: CertKeyAlgorithm.ECDSA_P256
  },
  {
    label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.ECDSA_P384],
    value: CertKeyAlgorithm.ECDSA_P384
  }
];

export const crlReasonToNameMap: { [K in CrlReason]: string } = {
  [CrlReason.UNSPECIFIED]: "Unspecified",
  [CrlReason.KEY_COMPROMISE]: "Key Compromise",
  [CrlReason.CA_COMPROMISE]: "CA Compromise",
  [CrlReason.AFFILIATION_CHANGED]: "Affiliation Changed",
  [CrlReason.SUPERSEDED]: "Superseded",
  [CrlReason.CESSATION_OF_OPERATION]: "Cessation of Operation",
  [CrlReason.CERTIFICATE_HOLD]: "Certificate Hold",
  // [CrlReason.REMOVE_FROM_CRL]: "Remove from CRL",
  [CrlReason.PRIVILEGE_WITHDRAWN]: "Privilege Withdrawn",
  [CrlReason.A_A_COMPROMISE]: "A/A Compromise"
};

export const crlReasons = [
  { label: crlReasonToNameMap[CrlReason.UNSPECIFIED], value: CrlReason.UNSPECIFIED },
  { label: crlReasonToNameMap[CrlReason.KEY_COMPROMISE], value: CrlReason.KEY_COMPROMISE },
  { label: crlReasonToNameMap[CrlReason.CA_COMPROMISE], value: CrlReason.CA_COMPROMISE },
  {
    label: crlReasonToNameMap[CrlReason.AFFILIATION_CHANGED],
    value: CrlReason.AFFILIATION_CHANGED
  },
  { label: crlReasonToNameMap[CrlReason.SUPERSEDED], value: CrlReason.SUPERSEDED },
  {
    label: crlReasonToNameMap[CrlReason.CESSATION_OF_OPERATION],
    value: CrlReason.CESSATION_OF_OPERATION
  },
  { label: crlReasonToNameMap[CrlReason.CERTIFICATE_HOLD], value: CrlReason.CERTIFICATE_HOLD },
  {
    label: crlReasonToNameMap[CrlReason.PRIVILEGE_WITHDRAWN],
    value: CrlReason.PRIVILEGE_WITHDRAWN
  },
  { label: crlReasonToNameMap[CrlReason.A_A_COMPROMISE], value: CrlReason.A_A_COMPROMISE }
];

export const KEY_USAGES_OPTIONS = [
  { value: CertKeyUsage.DIGITAL_SIGNATURE, label: "Digital Signature" },
  { value: CertKeyUsage.KEY_ENCIPHERMENT, label: "Key Encipherment" },
  { value: CertKeyUsage.NON_REPUDIATION, label: "Non Repudiation" },
  { value: CertKeyUsage.DATA_ENCIPHERMENT, label: "Data Encipherment" },
  { value: CertKeyUsage.KEY_AGREEMENT, label: "Key Agreement" },
  { value: CertKeyUsage.KEY_CERT_SIGN, label: "Certificate Sign" },
  { value: CertKeyUsage.CRL_SIGN, label: "CRL Sign" },
  { value: CertKeyUsage.ENCIPHER_ONLY, label: "Encipher Only" },
  { value: CertKeyUsage.DECIPHER_ONLY, label: "Decipher Only" }
] as const;

export const EXTENDED_KEY_USAGES_OPTIONS = [
  { value: CertExtendedKeyUsage.CLIENT_AUTH, label: "Client Auth" },
  { value: CertExtendedKeyUsage.SERVER_AUTH, label: "Server Auth" },
  { value: CertExtendedKeyUsage.EMAIL_PROTECTION, label: "Email Protection" },
  { value: CertExtendedKeyUsage.OCSP_SIGNING, label: "OCSP Signing" },
  { value: CertExtendedKeyUsage.CODE_SIGNING, label: "Code Signing" },
  { value: CertExtendedKeyUsage.TIMESTAMPING, label: "Timestamping" }
] as const;

export const SIGNATURE_ALGORITHMS_OPTIONS = [
  { value: "RSA-SHA256", label: "RSA-SHA256" },
  { value: "RSA-SHA384", label: "RSA-SHA384" },
  { value: "RSA-SHA512", label: "RSA-SHA512" },
  { value: "ECDSA-SHA256", label: "ECDSA-SHA256" },
  { value: "ECDSA-SHA384", label: "ECDSA-SHA384" },
  { value: "ECDSA-SHA512", label: "ECDSA-SHA512" }
] as const;
