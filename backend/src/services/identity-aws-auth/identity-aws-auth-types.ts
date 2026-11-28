import { TActorInput } from "@app/lib/types";

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
} & TActorInput;

export type TUpdateAwsAuthDTO = {
  identityId: string;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetAwsAuthDTO = {
  identityId: string;
} & TActorInput;

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
  isActorSuperAdmin?: boolean;
} & TActorInput;
