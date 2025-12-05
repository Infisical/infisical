import { TProjectPermission } from "@app/lib/types";

export type TLoginAliCloudAuthDTO = {
  identityId: string;
  Action: string;
  Format: string;
  Version: string;
  AccessKeyId: string;
  SignatureMethod: string;
  SecurityToken?: string;
  Timestamp: string;
  SignatureVersion: string;
  SignatureNonce: string;
  Signature: string;
};

export type TAttachAliCloudAuthDTO = {
  identityId: string;
  allowedArns: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAliCloudAuthDTO = {
  identityId: string;
  allowedArns: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetAliCloudAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeAliCloudAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TAliCloudGetUserResponse = {
  Arn: string;
};
