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
