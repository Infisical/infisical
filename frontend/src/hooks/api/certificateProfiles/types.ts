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
  keyAlgorithm?: string;
  signatureAlgorithm?: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  basicConstraints?: { isCA: boolean; pathLength?: number };
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
};

export type TCertificateProfile = {
  id: string;
  projectId: string;
  caId: string | null;
  certificatePolicyId: string;
  slug: string;
  description?: string;
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  estConfigId?: string;
  apiConfigId?: string;
  createdAt: string;
  updatedAt: string;
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
  certificateAuthority?: {
    id: string;
    projectId?: string;
    status: string;
    name: string;
    isExternal?: boolean;
    externalType?: string | null;
  };
};

export type TCertificateProfileWithDetails = TCertificateProfile & {
  certificateAuthority?: {
    id: string;
    projectId?: string;
    status: string;
    name: string;
    isExternal?: boolean;
    externalType?: string | null;
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
    skipDnsOwnershipVerification?: boolean;
    skipEabBinding?: boolean;
  };
};

export type TCreateCertificateProfileDTO = {
  projectId: string;
  caId?: string;
  certificatePolicyId: string;
  slug: string;
  description?: string;
  enrollmentType: EnrollmentType;
  issuerType: IssuerType;
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase: string;
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
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
};

export type TUpdateCertificateProfileDTO = {
  profileId: string;
  slug?: string;
  description?: string;
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
  acmeConfig?: {
    skipDnsOwnershipVerification?: boolean;
    skipEabBinding?: boolean;
  };
  externalConfigs?: Record<string, unknown> | null;
  defaults?: TCertificateProfileDefaults | null;
};

export type TDeleteCertificateProfileDTO = {
  profileId: string;
};

export type TListCertificateProfilesDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
  search?: string;
  includeConfigs?: boolean;
  enrollmentType?: EnrollmentType;
  issuerType?: IssuerType;
  caId?: string;
};

export type TGetCertificateProfileByIdDTO = {
  profileId: string;
};

export type TGetCertificateProfileBySlugDTO = {
  projectId: string;
  slug: string;
};

export type TRevealAcmeEabSecretDTO = {
  profileId: string;
};

export type TProfileCertificate = {
  id: string;
  serialNumber: string;
  cn: string;
  status: string;
  notBefore: string;
  notAfter: string;
  isRevoked: boolean;
  createdAt: string;
};

export type TGetProfileCertificatesDTO = {
  profileId: string;
  offset?: number;
  limit?: number;
  status?: "active" | "expired" | "revoked";
  search?: string;
};

export type TGetProfileMetricsDTO = {
  profileId: string;
};
