import { TProjectPermission } from "@app/lib/types";

export enum CertificateRequestStatus {
  PENDING = "pending",
  ISSUED = "issued",
  FAILED = "failed"
}

export type TCreateCertificateRequestDTO = TProjectPermission & {
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
  metadata?: string;
  status: CertificateRequestStatus;
  certificateId?: string;
  acmeOrderId?: string;
  basicConstraints?: {
    isCA: boolean;
    pathLength?: number;
  };
};

export type TGetCertificateRequestDTO = TProjectPermission & {
  certificateRequestId: string;
};

export type TGetCertificateFromRequestDTO = Omit<TProjectPermission, "projectId"> & {
  certificateRequestId: string;
};

export type TUpdateCertificateRequestStatusDTO = {
  certificateRequestId: string;
  status: CertificateRequestStatus;
  errorMessage?: string;
};

export type TAttachCertificateToRequestDTO = {
  certificateRequestId: string;
  certificateId: string;
};

export type TListCertificateRequestsDTO = TProjectPermission & {
  offset?: number;
  limit?: number;
  search?: string;
  status?: CertificateRequestStatus;
  fromDate?: Date;
  toDate?: Date;
  profileIds?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};
