import { TProjectPermission } from "@app/lib/types";

export type TAttachUaDTO = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenPeriod: number;
  clientSecretTrustedIps: { ipAddress: string }[];
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateUaDTO = {
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenPeriod?: number;
  clientSecretTrustedIps?: { ipAddress: string }[];
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetUaDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeUaDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateUaClientSecretDTO = {
  identityId: string;
  description: string;
  numUsesLimit: number;
  ttl: number;
} & Omit<TProjectPermission, "projectId">;

export type TGetUaClientSecretsDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeUaClientSecretDTO = {
  identityId: string;
  clientSecretId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetUniversalAuthClientSecretByIdDTO = {
  identityId: string;
  clientSecretId: string;
} & Omit<TProjectPermission, "projectId">;
