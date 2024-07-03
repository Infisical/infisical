import { TProjectPermission } from "@app/lib/types";

export type TAttachOidcAuthDTO = {
  identityId: string;
  oidcDiscoveryUrl: string;
  caCert: string;
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateOidcAuthDTO = {
  identityId: string;
  oidcDiscoveryUrl?: string;
  caCert?: string;
  boundIssuer?: string;
  boundAudiences?: string;
  boundClaims?: Record<string, string>;
  boundSubject?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetOidcAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TLoginOidcAuthDTO = {
  identityId: string;
  jwt: string;
};

export type TRevokeOidcAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
