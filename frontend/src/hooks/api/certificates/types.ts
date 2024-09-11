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
  extendedKeyUsages: CertExtendedKeyUsage[];
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

export enum CertExtendedKeyUsage {
  CLIENT_AUTH = "clientAuth",
  SERVER_AUTH = "serverAuth",
  CODE_SIGNING = "codeSigning",
  EMAIL_PROTECTION = "emailProtection",
  TIMESTAMPING = "timeStamping",
  OCSP_SIGNING = "ocspSigning"
}

export const EXTENDED_KEY_USAGES_OPTIONS = [
  { value: CertExtendedKeyUsage.CLIENT_AUTH, label: "Client Auth" },
  { value: CertExtendedKeyUsage.SERVER_AUTH, label: "Server Auth" },
  { value: CertExtendedKeyUsage.EMAIL_PROTECTION, label: "Email Protection" },
  { value: CertExtendedKeyUsage.OCSP_SIGNING, label: "OCSP Signing" },
  { value: CertExtendedKeyUsage.CODE_SIGNING, label: "Code Signing" },
  { value: CertExtendedKeyUsage.TIMESTAMPING, label: "Timestamping" }
] as const;
