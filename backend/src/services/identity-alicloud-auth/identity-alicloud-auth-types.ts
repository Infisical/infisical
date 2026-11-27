import { TActorInput } from "@app/lib/types";

export type TLoginAliCloudAuthDTO = {
  identityId: string;
  Action: string;
  Format: string;
  Version: string;
  AccessKeyId: string;
  SignatureMethod: string;
  Timestamp: string;
  SignatureVersion: string;
  SignatureNonce: string;
  Signature: string;
  organizationSlug?: string;
};

export type TAttachAliCloudAuthDTO = {
  identityId: string;
  allowedArns: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TUpdateAliCloudAuthDTO = {
  identityId: string;
  allowedArns: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetAliCloudAuthDTO = {
  identityId: string;
} & TActorInput;

export type TRevokeAliCloudAuthDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TAliCloudGetUserResponse = {
  Arn: string;
};
