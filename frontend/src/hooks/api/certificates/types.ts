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
  id: string;
  projectId: string;
};

export type TRevokeCertDTO = {
  projectId: string;
  id: string;
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
  certificateId: string;
  projectSlug: string;
  password: string;
  alias: string;
};

export type TUnifiedCertificateIssuanceDTO = {
  projectSlug: string;
  profileId: string;
  projectId: string;
  csr?: string;
  attributes?: {
    commonName?: string;
    keyUsages?: string[];
    extendedKeyUsages?: string[];
    altNames?: Array<{
      type: string;
      value: string;
    }>;
    signatureAlgorithm: string;
    keyAlgorithm: string;
    subjectAlternativeNames?: Array<{
      type: string;
      value: string;
    }>;
    ttl: string;
    notBefore?: string;
    notAfter?: string;
  };
  removeRootsFromChain?: boolean;
};

export type TUnifiedCertificateResponse = {
  certificate: {
    certificate: string;
    issuingCaCertificate: string;
    certificateChain: string;
    privateKey?: string;
    serialNumber: string;
    certificateId: string;
  };
  certificateRequestId: string;
};

export type TCertificateRequestResponse = {
  certificateRequestId: string;
  status: "pending_approval" | "pending" | "issued" | "failed" | "rejected";
  projectId: string;
};

export type TUnifiedCertificateIssuanceResponse =
  | TUnifiedCertificateResponse
  | TCertificateRequestResponse;

export type TCertificateRequestDetails = {
  status: "pending" | "issued" | "failed" | "pending_approval" | "rejected";
  certificate: string | null;
  certificateId: string | null;
  privateKey: string | null;
  serialNumber: string | null;
  errorMessage: string | null;
  commonName: string | null;
  organization: string | null;
  organizationalUnit: string | null;
  country: string | null;
  state: string | null;
  locality: string | null;
  basicConstraints: {
    isCA: boolean;
    pathLength?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type TCertificateRequestListItem = {
  id: string;
  status: "pending_approval" | "pending" | "issued" | "failed" | "rejected";
  commonName: string | null;
  altNames: string | null;
  profileId: string | null;
  profileName: string | null;
  caId: string | null;
  certificateId: string | null;
  approvalRequestId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  certificate: {
    id: string;
    serialNumber: string;
    status: string;
  } | null;
};

export type TListCertificateRequestsResponse = {
  certificateRequests: TCertificateRequestListItem[];
  totalCount: number;
};

export type TListCertificateRequestsParams = {
  projectSlug: string;
  offset?: number;
  limit?: number;
  search?: string;
  status?: "pending" | "issued" | "failed";
  fromDate?: Date;
  toDate?: Date;
  profileIds?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};
