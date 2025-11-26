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

export enum IssuerType {
  CA = "ca",
  SELF_SIGNED = "self-signed"
}

export type TCertificateProfile = Omit<TPkiCertificateProfiles, "enrollmentType" | "issuerType"> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
};

export type TCertificateProfileInsert = Omit<TPkiCertificateProfilesInsert, "enrollmentType" | "issuerType"> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
};

export type TCertificateProfileUpdate = Omit<TPkiCertificateProfilesUpdate, "enrollmentType" | "issuerType"> & {
  enrollmentType?: EnrollmentType;
  issuerType?: IssuerType;
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
