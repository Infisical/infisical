import { TIdentityAccessTokens, TIdentityOrgMemberships, TIdentityTlsCertAuths } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TLoginTlsCertAuthDTO = {
  identityId: string;
  clientCertificate: string;
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
  login: (dto: TLoginTlsCertAuthDTO) => Promise<{
    identityTlsCertAuth: TIdentityTlsCertAuths;
    accessToken: string;
    identityAccessToken: TIdentityAccessTokens;
    identityMembershipOrg: TIdentityOrgMemberships;
  }>;
  attachTlsCertAuth: (dto: TAttachTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  updateTlsCertAuth: (dto: TUpdateTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  revokeTlsCertAuth: (dto: TRevokeTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths>;
  getTlsCertAuth: (dto: TGetTlsCertAuthDTO) => Promise<TIdentityTlsCertAuths & { caCertificate: string }>;
};
