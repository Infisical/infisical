import { TProjectPermission } from "@app/lib/types";

export enum SpiffeConfigurationType {
  STATIC = "static",
  REMOTE = "remote"
}

export enum SpiffeBundleEndpointProfile {
  HTTPS_WEB = "https_web",
  HTTPS_SPIFFE = "https_spiffe"
}

export type TLoginSpiffeAuthDTO = {
  identityId: string;
  jwt: string;
  organizationSlug?: string;
};

export type TAttachSpiffeAuthDTO = {
  identityId: string;
  trustDomain: string;
  allowedSpiffeIds: string;
  allowedAudiences: string;
  configurationType: SpiffeConfigurationType;
  caBundleJwks?: string;
  bundleEndpointUrl?: string;
  bundleEndpointProfile?: SpiffeBundleEndpointProfile;
  bundleEndpointCaCert?: string;
  bundleRefreshHintSeconds?: number;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSpiffeAuthDTO = {
  identityId: string;
  trustDomain?: string;
  allowedSpiffeIds?: string;
  allowedAudiences?: string;
  configurationType?: SpiffeConfigurationType;
  caBundleJwks?: string;
  bundleEndpointUrl?: string;
  bundleEndpointProfile?: SpiffeBundleEndpointProfile;
  bundleEndpointCaCert?: string;
  bundleRefreshHintSeconds?: number;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetSpiffeAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeSpiffeAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
