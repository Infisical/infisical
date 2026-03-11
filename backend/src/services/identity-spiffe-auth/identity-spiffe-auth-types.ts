import { TProjectPermission } from "@app/lib/types";

export enum SpiffeTrustBundleProfile {
  STATIC = "static",
  HTTPS_WEB_BUNDLE = "https_web_bundle"
}

// FIPS 140-2 approved JWT signing algorithms only.
// EdDSA (Ed25519) and other non-NIST algorithms are excluded to avoid
// opaque internal errors when running in FIPS-compliant environments.
export const FIPS_APPROVED_JWT_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512"
];

export type TSpiffeTrustBundleDistribution =
  | {
      profile: SpiffeTrustBundleProfile.STATIC;
      bundle: string;
    }
  | {
      profile: SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE;
      endpointUrl: string;
      caCert?: string;
      refreshHintSeconds?: number;
    };

export type TSpiffeTrustBundleDistributionResponse =
  | {
      profile: SpiffeTrustBundleProfile.STATIC;
      bundle: string;
    }
  | {
      profile: SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE;
      endpointUrl: string;
      caCert: string;
      refreshHintSeconds: number;
      cachedBundleLastRefreshedAt: Date | null | undefined;
    };

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
  trustBundleDistribution: TSpiffeTrustBundleDistribution;
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
  trustBundleDistribution?: TSpiffeTrustBundleDistribution;
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
