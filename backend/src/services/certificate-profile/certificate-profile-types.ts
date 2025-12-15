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

export type TCertificateProfile = Omit<TPkiCertificateProfiles, "enrollmentType" | "issuerType" | "externalConfigs"> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
};

export type TCertificateProfileInsert = Omit<
  TPkiCertificateProfilesInsert,
  "enrollmentType" | "issuerType" | "externalConfigs"
> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
};

export type TCertificateProfileUpdate = Omit<
  TPkiCertificateProfilesUpdate,
  "enrollmentType" | "issuerType" | "externalConfigs"
> & {
  enrollmentType?: EnrollmentType;
  issuerType?: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase?: string;
    caChain?: string;
  };
  apiConfig?: {
    autoRenew?: boolean;
    renewBeforeDays?: number;
  };
  acmeConfig?: {
    skipDnsOwnershipVerification?: boolean;
  };
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
    isExternal?: boolean;
    externalType?: string;
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
    skipDnsOwnershipVerification?: boolean;
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
