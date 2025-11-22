export type TCertificateProfile = {
  id: string;
  projectId: string;
  caId: string | null;
  certificateTemplateId: string;
  slug: string;
  description?: string;
  enrollmentType: "api" | "est" | "acme";
  issuerType: "ca" | "self-signed";
  estConfigId?: string;
  apiConfigId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TCertificateProfileWithDetails = TCertificateProfile & {
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
  };
};

export type TCreateCertificateProfileDTO = {
  projectId: string;
  caId?: string;
  certificateTemplateId: string;
  slug: string;
  description?: string;
  enrollmentType: "api" | "est" | "acme";
  issuerType: "ca" | "self-signed";
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase: string;
    caChain?: string;
  };
  apiConfig?: {
    autoRenew?: boolean;
    renewBeforeDays?: number;
  };
  acmeConfig?: unknown;
};

export type TUpdateCertificateProfileDTO = {
  profileId: string;
  slug?: string;
  description?: string;
  enrollmentType?: "api" | "est" | "acme";
  issuerType?: "ca" | "self-signed";
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

export type TDeleteCertificateProfileDTO = {
  profileId: string;
};

export type TListCertificateProfilesDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
  search?: string;
  includeConfigs?: boolean;
  enrollmentType?: "api" | "est" | "acme";
  issuerType?: "ca" | "self-signed";
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
