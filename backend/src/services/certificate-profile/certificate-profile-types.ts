import {
  TPkiCertificateProfiles,
  TPkiCertificateProfilesInsert,
  TPkiCertificateProfilesUpdate
} from "@app/db/schemas/pki-certificate-profiles";

export enum EnrollmentType {
  API = "api",
  EST = "est",
  ACME = "acme"
}

export type TCertificateProfile = Omit<TPkiCertificateProfiles, "enrollmentType"> & {
  enrollmentType: EnrollmentType;
};

export type TCertificateProfileInsert = Omit<TPkiCertificateProfilesInsert, "enrollmentType"> & {
  enrollmentType: EnrollmentType;
};

export type TCertificateProfileUpdate = Omit<TPkiCertificateProfilesUpdate, "enrollmentType"> & {
  enrollmentType?: EnrollmentType;
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase?: string;
    caChain?: string;
  };
  apiConfig?: {
    autoRenew?: boolean;
    renewBeforeDays?: number;
  };
  acmeConfig?: unknown;
};

export type TCertificateProfileWithConfigs = TCertificateProfile & {
  project?: {
    id: string;
    orgId: string;
  };
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
    passphrase: string;
    caChain: string;
  };
  apiConfig?: {
    id: string;
    autoRenew: boolean;
    renewBeforeDays?: number;
  };
  acmeConfig?: {
    id: string;
    directoryUrl: string;
    encryptedEabSecret?: Buffer;
  };
};

export interface TCertificateProfileCertificate {
  id: string;
  serialNumber: string;
  cn: string;
  status: string;
  notBefore: Date;
  notAfter: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
