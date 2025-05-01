import { CertExtendedKeyUsage, CertKeyUsage, CertStatus } from "./enums";

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

export type TImportCertificateDTO = {
  projectSlug: string;

  certificatePem: string;
  privateKeyPem: string;
  chainPem: string;

  pkiCollectionId?: string;
  friendlyName?: string;
};

export type TImportCertificateResponse = {
  certificate: string;
  certificateChain: string;
  privateKey: string;
  serialNumber: string;
};
