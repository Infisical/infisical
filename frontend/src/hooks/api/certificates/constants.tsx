import { CertKeyAlgorithm,CertStatus } from "./enums";

export const certStatusToNameMap: { [K in CertStatus]: string } = {
  [CertStatus.ACTIVE]: "Active",
  [CertStatus.REVOKED]: "Revoked"
};

export const certKeyAlgorithmToNameMap: { [K in CertKeyAlgorithm]: string } = {
  [CertKeyAlgorithm.RSA_2048]: "RSA 2048",
  [CertKeyAlgorithm.RSA_4096]: "RSA 4096",
  [CertKeyAlgorithm.ECDSA_P256]: "ECDSA P256",
  [CertKeyAlgorithm.ECDSA_P384]: "ECDSA P384"
};

export const certKeyAlgorithms = [
  { label: "RSA 2048", value: CertKeyAlgorithm.RSA_2048 },
  { label: "RSA 4096", value: CertKeyAlgorithm.RSA_4096 },
  { label: "ECDSA P256", value: CertKeyAlgorithm.ECDSA_P256 },
  { label: "ECDSA P384", value: CertKeyAlgorithm.ECDSA_P384 }
];
