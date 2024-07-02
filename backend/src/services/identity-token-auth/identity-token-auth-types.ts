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
} & Omit<TProjectPermission, "projectId">;
