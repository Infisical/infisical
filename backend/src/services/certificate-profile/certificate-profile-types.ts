import {
  TPkiCertificateProfiles,
  TPkiCertificateProfilesInsert,
  TPkiCertificateProfilesUpdate
} from "@app/db/schemas/pki-certificate-profiles";

import {
  CertExtendedKeyUsageType,
  CertKeyAlgorithm,
  CertKeyUsageType,
  CertSignatureAlgorithm
} from "../certificate-common/certificate-constants";

export enum EnrollmentType {
  API = "api",
  EST = "est",
  ACME = "acme"
}

export enum IssuerType {
  CA = "ca",
  SELF_SIGNED = "self-signed"
}

export type TCertificateProfileDefaults = {
  ttlDays?: number;
  commonName?: string;
  keyAlgorithm?: CertKeyAlgorithm;
  signatureAlgorithm?: CertSignatureAlgorithm;
  keyUsages?: CertKeyUsageType[];
  extendedKeyUsages?: CertExtendedKeyUsageType[];
  basicConstraints?: { isCA: boolean; pathLength?: number };
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
};

export type TCertificateProfile = Omit<
  TPkiCertificateProfiles,
  "enrollmentType" | "issuerType" | "externalConfigs" | "defaults"
> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
};

export type TCertificateProfileInsert = Omit<
  TPkiCertificateProfilesInsert,
  "enrollmentType" | "issuerType" | "externalConfigs" | "defaults"
> & {
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
};

export type TCertificateProfileUpdate = Omit<
  TPkiCertificateProfilesUpdate,
  "enrollmentType" | "issuerType" | "externalConfigs" | "defaults"
> & {
  enrollmentType?: EnrollmentType;
  issuerType?: IssuerType;
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
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
    skipEabBinding?: boolean;
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
  certificatePolicy?: {
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
    skipEabBinding?: boolean;
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
