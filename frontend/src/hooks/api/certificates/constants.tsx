import { CertKeyAlgorithm, CertStatus, CrlReason } from "./enums";

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
  [CertKeyAlgorithm.RSA_4096]: "RSA 4096",
  [CertKeyAlgorithm.ECDSA_P256]: "ECDSA P256",
  [CertKeyAlgorithm.ECDSA_P384]: "ECDSA P384"
};

export const certKeyAlgorithms = [
  { label: certKeyAlgorithmToNameMap[CertKeyAlgorithm.RSA_2048], value: CertKeyAlgorithm.RSA_2048 },
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
