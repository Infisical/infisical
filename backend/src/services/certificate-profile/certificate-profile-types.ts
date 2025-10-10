import {
  TCertificateProfiles,
  TCertificateProfilesInsert,
  TCertificateProfilesUpdate
} from "@app/db/schemas/certificate-profiles";

export enum EnrollmentType {
  API = "api",
  EST = "est"
}

export type TCertificateProfile = Omit<TCertificateProfiles, "enrollmentType"> & {
  enrollmentType: EnrollmentType;
};

export type TCertificateProfileInsert = Omit<TCertificateProfilesInsert, "enrollmentType"> & {
  enrollmentType: EnrollmentType;
};

export type TCertificateProfileUpdate = Omit<TCertificateProfilesUpdate, "enrollmentType"> & {
  enrollmentType?: EnrollmentType;
};

export type TCertificateProfileWithConfigs = TCertificateProfile & {
  certificateAuthority?: {
    id: string;
    projectId: string;
    status: string;
    name: string;
  };
  certificateTemplate?: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
  };
  estConfig?: {
    id: string;
    disableBootstrapCaValidation: boolean;
    hashedPassphrase: string;
    encryptedCaChain: Buffer;
  };
  apiConfig?: {
    id: string;
    autoRenew: boolean;
    autoRenewDays?: number;
  };
  metrics?: TCertificateProfileMetrics;
};

export interface TCertificateProfileMetrics {
  profileId: string;
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  expiringCertificates: number;
  revokedCertificates: number;
}

export interface TCertificateProfileCertificate {
  id: string;
  serialNumber: string;
  cn: string;
  status: string;
  notBefore: Date;
  notAfter: Date;
  revokedAt: Date | null | undefined;
  createdAt: Date;
}

export type TCertificateProfileWithRawMetrics = TCertificateProfile & {
  total_certificates?: string;
  active_certificates?: string;
  expired_certificates?: string;
  expiring_certificates?: string;
  revoked_certificates?: string;
};
