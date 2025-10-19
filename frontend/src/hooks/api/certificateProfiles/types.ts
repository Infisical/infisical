export type TCertificateProfile = {
  id: string;
  projectId: string;
  caId: string;
  certificateTemplateId: string;
  slug: string;
  description?: string;
  enrollmentType: "api" | "est";
  estConfigId?: string;
  apiConfigId?: string;
  createdAt: string;
  updatedAt: string;
  metrics?: TCertificateProfileMetrics;
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
    autoRenewDays?: number;
  };
};

export type TCreateCertificateProfileDTO = {
  projectId: string;
  caId: string;
  certificateTemplateId: string;
  slug: string;
  description?: string;
  enrollmentType: "api" | "est";
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase: string;
    caChain?: string;
  };
  apiConfig?: {
    autoRenew?: boolean;
    autoRenewDays?: number;
  };
};

export type TUpdateCertificateProfileDTO = {
  profileId: string;
  slug?: string;
  description?: string;
  estConfig?: {
    disableBootstrapCaValidation?: boolean;
    passphrase?: string;
    caChain?: string;
  };
  apiConfig?: {
    autoRenew?: boolean;
    autoRenewDays?: number;
  };
};

export type TDeleteCertificateProfileDTO = {
  profileId: string;
};

export type TListCertificateProfilesDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
  search?: string;
  includeMetrics?: boolean;
  includeConfigs?: boolean;
  expiringDays?: number;
};

export type TGetCertificateProfileByIdDTO = {
  profileId: string;
};

export type TGetCertificateProfileBySlugDTO = {
  projectId: string;
  slug: string;
};

export type TCertificateProfileMetrics = {
  profileId: string;
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  expiringCertificates: number;
  revokedCertificates: number;
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
  expiringDays?: number;
};
