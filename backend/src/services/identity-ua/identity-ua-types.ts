import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { TActorInput } from "@app/lib/types";

export const MAX_UA_CLIENT_SECRET_TTL_SECONDS = 315_360_000; // 10 years

export type TLoginUaDTO = {
  clientId: string;
  clientSecret: string;
  ip: string;
  organizationSlug?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
};

export type TAttachUaDTO = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenPeriod: number;
  clientSecretTrustedIps: { ipAddress: string }[];
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
} & TActorInput;

export type TUpdateUaDTO = {
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenPeriod?: number;
  clientSecretTrustedIps?: { ipAddress: string }[];
  accessTokenTrustedIps?: { ipAddress: string }[];
  lockoutEnabled?: boolean;
  lockoutThreshold?: number;
  lockoutDurationSeconds?: number;
  lockoutCounterResetSeconds?: number;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetUaDTO = {
  identityId: string;
} & TActorInput;

export type TRevokeUaDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TCreateUaClientSecretDTO = {
  identityId: string;
  description: string;
  numUsesLimit: number;
  ttl: number;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetUaClientSecretsDTO = {
  identityId: string;
} & TActorInput;

export type TRevokeUaClientSecretDTO = {
  identityId: string;
  clientSecretId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TClearUaLockoutsDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetUniversalAuthClientSecretByIdDTO = {
  identityId: string;
  clientSecretId: string;
} & TActorInput;
