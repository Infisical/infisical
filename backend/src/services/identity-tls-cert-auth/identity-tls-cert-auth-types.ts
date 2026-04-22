import { TIdentityTlsCertAuths } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";
import { TLoginResult } from "@app/services/identity-auth/identity-auth-pipeline";

export type TLoginTlsCertAuthDTO = {
  identityId: string;
  clientCertificate: string;
  organizationSlug?: string;
};

export type TAttachTlsCertAuthDTO = {
  identityId: string;
  caCertificate: string;
  allowedCommonNames?: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateTlsCertAuthDTO = {
  identityId: string;
  caCertificate?: string;
  allowedCommonNames?: string | null;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetTlsCertAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeTlsCertAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIdentityTlsCertAuthServiceFactory = {
  login: (
    dto: TLoginTlsCertAuthDTO
  ) => Promise<Omit<TLoginResult, "authConfig"> & { identityTlsCertAuth: TIdentityTlsCertAuths }>;
  attachTlsCertAuth: (dto: TAttachTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  updateTlsCertAuth: (dto: TUpdateTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  revokeTlsCertAuth: (dto: TRevokeTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  getTlsCertAuth: (dto: TGetTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths & { caCertificate: string }>;
};
