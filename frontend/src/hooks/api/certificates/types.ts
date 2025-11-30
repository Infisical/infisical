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
  projectId: string;
  serialNumber: string;
};

export type TRevokeCertDTO = {
  projectId: string;
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
  certificateRequestId?: string;
};

export type TUpdateRenewalConfigDTO = {
  certificateId: string;
  renewBeforeDays?: number;
  enableAutoRenewal?: boolean;
  projectSlug: string;
};

export type TDownloadPkcs12DTO = {
  serialNumber: string;
  projectSlug: string;
  password: string;
  alias: string;
};

export type TUnifiedCertificateIssuanceDTO = {
  projectSlug: string;
  projectId: string;
  profileId?: string;
  caId?: string;
  csr?: string;
  commonName?: string;
  altNames?: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  notBefore?: Date;
  notAfter?: Date;
  keyAlgorithm?: string;
  signatureAlgorithm?: string;
  ttl?: string;
  friendlyName?: string;
  pkiCollectionId?: string;
  issuerType?: string;
};

export type TUnifiedCertificateResponse = {
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  privateKey?: string;
  serialNumber: string;
  certificateId: string;
  projectId: string;
};

export type TCertificateRequestResponse = {
  certificateRequestId: string;
  status: "pending" | "issued" | "failed";
  projectId: string;
};

export type TUnifiedCertificateIssuanceResponse =
  | TUnifiedCertificateResponse
  | TCertificateRequestResponse;

export type TCertificateRequestDetails = {
  status: "pending" | "issued" | "failed";
  certificate: TCertificate | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
