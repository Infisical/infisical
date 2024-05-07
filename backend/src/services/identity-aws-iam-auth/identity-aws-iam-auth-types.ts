import { TProjectPermission } from "@app/lib/types";

export type TLoginAWSIAMAuthDTO = {
  identityId: string;
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
};

export type TAttachAWSIAMAuthDTO = {
  identityId: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAWSIAMAuthDTO = {
  identityId: string;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
} & Omit<TProjectPermission, "projectId">;

export type TGetAWSIAMAuthDTO = {
  identityId: string;
} & Omit<TProjectPermission, "projectId">;

export type TAWSGetCallerIdentityHeaders = {
  "Content-Type": string;
  Host: string;
  "X-Amz-Date": string;
  "Content-Length": number;
  "x-amz-security-token": string;
  Authorization: string;
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
