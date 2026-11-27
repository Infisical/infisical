import { TActorInput } from "@app/lib/types";

export type TAttachTokenAuthDTO = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TUpdateTokenAuthDTO = {
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetTokenAuthDTO = {
  identityId: string;
} & TActorInput;

export type TRevokeTokenAuthDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TCreateTokenAuthTokenDTO = {
  identityId: string;
  name?: string;
  organizationSlug?: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetTokenAuthTokensDTO = {
  identityId: string;
  offset: number;
  limit: number;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetTokenAuthTokenByIdDTO = {
  tokenId: string;
} & TActorInput;

export type TUpdateTokenAuthTokenDTO = {
  tokenId: string;
  name?: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TRevokeTokenAuthTokenDTO = {
  tokenId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;
