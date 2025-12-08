import { TProjectPermission } from "@app/lib/types";

export type TAttachTokenAuthDTO = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateTokenAuthDTO = {
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TGetTokenAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeTokenAuthDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TCreateTokenAuthTokenDTO = {
  identityId: string;
  name?: string;
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TGetTokenAuthTokensDTO = {
  identityId: string;
  offset: number;
  limit: number;
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TGetTokenAuthTokenByIdDTO = {
  tokenId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateTokenAuthTokenDTO = {
  tokenId: string;
  name?: string;
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeTokenAuthTokenDTO = {
  tokenId: string;
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;
