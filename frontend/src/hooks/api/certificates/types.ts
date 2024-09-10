import { CertStatus } from "./enums";

export type TCertificate = {
  id: string;
  caId: string;
  certificateTemplateId?: string;
  status: CertStatus;
  friendlyName: string;
  commonName: string;
  altNames: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  keyUsages: CertKeyUsage[];
};

export type TDeleteCertDTO = {
  projectSlug: string;
  serialNumber: string;
};

export type TRevokeCertDTO = {
  projectSlug: string;
  serialNumber: string;
  revocationReason: string;
};

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
