import { TProjectPermission } from "@app/lib/types";

import { ACMESANType, CertificateOrderStatus } from "../certificate/certificate-types";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { EnrollmentType } from "../certificate-profile/certificate-profile-types";

export type TIssueCertificateFromProfileDTO = {
  profileId: string;
  certificateRequest: {
    commonName?: string;
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
  allowEmptyCommonName?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TOrderCertificateFromProfileDTO = {
  profileId: string;
  certificateOrder: {
    altNames: Array<{
      type: ACMESANType;
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
  };
  removeRootsFromChain?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TCertificateFromProfileResponse = {
  certificate: string;
  issuingCaCertificate: string;
  certificateChain: string;
  privateKey?: string;
  serialNumber: string;
  certificateId: string;
  projectId: string;
  profileName: string;
  commonName: string;
};

export type TCertificateOrderResponse = {
  orderId: string;
  status: CertificateOrderStatus;
  subjectAlternativeNames: Array<{
    type: ACMESANType;
    value: string;
    status: CertificateOrderStatus;
  }>;
  authorizations: Array<{
    identifier: {
      type: ACMESANType;
      value: string;
    };
    status: CertificateOrderStatus;
    expires?: string;
    challenges: Array<{
      type: string;
      status: CertificateOrderStatus;
      url: string;
      token: string;
    }>;
  }>;
  finalize: string;
  certificate?: string;
  projectId: string;
  profileName: string;
};

export type TRenewCertificateDTO = {
  certificateId: string;
  removeRootsFromChain?: boolean;
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
