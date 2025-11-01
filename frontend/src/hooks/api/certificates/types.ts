import { CertExtendedKeyUsage, CertKeyUsage, CertStatus } from "./enums";

export type TCertificate = {
  id: string;
  caId: string;
  certificateTemplateId?: string;
  profileId?: string;
  status: CertStatus;
  friendlyName: string;
  commonName: string;
  subjectAltNames: string;
  altNames?: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  renewBeforeDays?: number;
  renewedBy?: string;
  renewedFromCertificateId?: string;
  renewedByCertificateId?: string;
  renewalError?: string;
  hasPrivateKey?: boolean;
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

export type TRenewCertificateDTO = {
  certificateId: string;
};

export type TRenewCertificateResponse = {
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  privateKey?: string;
  serialNumber: string;
  certificateId: string;
  projectId: string;
};

export type TUpdateRenewalConfigDTO = {
  certificateId: string;
  renewBeforeDays?: number;
  enableAutoRenewal?: boolean;
  projectSlug: string;
};
