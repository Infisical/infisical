import { TProjectPermission } from "@app/lib/types";

export type TLoginAwsAuthDTO = {
  identityId: string;
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
  organizationSlug?: string;
};

export type TAttachAwsAuthDTO = {
  identityId: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAwsAuthDTO = {
  identityId: string;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetAwsAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TAwsGetCallerIdentityHeaders = {
  "Content-Type": string;
  Host: string;
  "X-Amz-Date": string;
  "Content-Length": number;
  "x-amz-security-token": string;
  Authorization?: string;
  authorization?: string;
};

export type TGetCallerIdentityResponse = {
  GetCallerIdentityResponse: {
    GetCallerIdentityResult: {
      Account: string;
      Arn: string;
      UserId: string;
    };
    ResponseMetadata: { RequestId: string };
  };
};

export type TRevokeAwsAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;
