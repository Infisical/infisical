import { TProjectPermission } from "@app/lib/types";

export type TAttachTokenAuthDTO = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateTokenAuthDTO = {
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetTokenAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeTokenAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateTokenTokenAuthDTO = {
  identityId: string;
  name?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetTokensTokenAuthDTO = {
  identityId: string;
  offset: number;
  limit: number;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateTokenTokenAuthDTO = {
  identityId: string;
  tokenId: string;
  name?: string;
} & Omit<TProjectPermission, "projectId">;
