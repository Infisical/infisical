import { TProjectPermission } from "@app/lib/types";

export enum JwtConfigurationType {
  JWKS = "jwks",
  STATIC = "static"
}

export type TAttachJwtAuthDTO = {
  identityId: string;
  configurationType: JwtConfigurationType;
  jwksUrl: string;
  jwksCaCert: string;
  publicKeys: string[];
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateJwtAuthDTO = {
  identityId: string;
  configurationType?: JwtConfigurationType;
  jwksUrl?: string;
  jwksCaCert?: string;
  publicKeys?: string[];
  boundIssuer?: string;
  boundAudiences?: string;
  boundClaims?: Record<string, string>;
  boundSubject?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetJwtAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeJwtAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TLoginJwtAuthDTO = {
  identityId: string;
  jwt: string;
  organizationSlug?: string;
};
