import { TProjectPermission } from "@app/lib/types";

import {
  CertExtendedKeyUsageType,
  CertificateIssuanceType,
  CertificateRequestStatus,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { EnrollmentType } from "../certificate-profile/certificate-profile-types";

export { CertificateIssuanceType };

export type TIssueCertificateFromProfileDTO = {
  profileId: string;
  certificateRequest: {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    keyUsages?: CertKeyUsageType[];
    extendedKeyUsages?: CertExtendedKeyUsageType[];
    altNames?: Array<{
      type: CertSubjectAlternativeNameType;
      value: string;
    }>;
    validity: {
      ttl: string;
    };
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: string;
    basicConstraints?: {
      isCA: boolean;
      pathLength?: number;
    };
  };
  removeRootsFromChain?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TSignCertificateFromProfileDTO = {
  profileId: string;
  csr: string;
  validity: {
    ttl: string;
  };
  notBefore?: Date;
  notAfter?: Date;
  enrollmentType: EnrollmentType;
  removeRootsFromChain?: boolean;
  basicConstraints?: {
    isCA: boolean;
    pathLength?: number;
  };
} & Omit<TProjectPermission, "projectId">;

export type TOrderCertificateFromProfileDTO = {
  profileId: string;
  certificateOrder: {
    altNames: Array<{
      type: CertSubjectAlternativeNameType;
      value: string;
    }>;
    validity: {
      ttl: string;
    };
    commonName?: string;
    keyUsages?: CertKeyUsageType[];
    extendedKeyUsages?: CertExtendedKeyUsageType[];
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: string;
    template?: string;
    csr?: string;
  };
  removeRootsFromChain?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TCertificateIssuanceResponse = {
  status: CertificateRequestStatus;
  certificateRequestId: string;
  projectId: string;
  profileName: string;
  commonName?: string;
  certificate?: string;
  issuingCaCertificate?: string;
  certificateChain?: string;
  privateKey?: string;
  serialNumber?: string;
  certificateId?: string;
  message?: string;
};

export type TCertificateIssuedResponse = TCertificateIssuanceResponse & {
  status: CertificateRequestStatus.ISSUED;
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  serialNumber: string;
  certificateId: string;
};

export type TCertificatePendingApprovalResponse = TCertificateIssuanceResponse & {
  status: CertificateRequestStatus.PENDING_APPROVAL;
};

export type TRenewCertificateDTO = {
  certificateId: string;
  removeRootsFromChain?: boolean;
  certificateRequestId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateRenewalConfigDTO = {
  certificateId: string;
  renewBeforeDays: number;
} & Omit<TProjectPermission, "projectId">;

export type TDisableRenewalConfigDTO = {
  certificateId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRenewalConfigResponse = {
  projectId: string;
  renewBeforeDays: number;
  commonName: string;
};

export type TDisableRenewalResponse = {
  projectId: string;
  commonName: string;
};

export const isPendingApprovalResponse = (
  response: TCertificateIssuanceResponse
): response is TCertificatePendingApprovalResponse => {
  return response.status === CertificateRequestStatus.PENDING_APPROVAL;
};

export const isIssuedResponse = (response: TCertificateIssuanceResponse): response is TCertificateIssuedResponse => {
  return response.status === CertificateRequestStatus.ISSUED;
};

export type TAltNameEntry = {
  type: CertSubjectAlternativeNameType;
  value: string;
};
