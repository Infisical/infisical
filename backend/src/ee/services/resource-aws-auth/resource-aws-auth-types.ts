import { OrgServiceActor, TGenericPermission } from "@app/lib/types";

import { ResourceRef } from "../resource-auth-method-fns";

export type TAttachResourceAwsAuthDTO = {
  resource: ResourceRef;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  actor: OrgServiceActor;
};

export type TUpdateResourceAwsAuthDTO = {
  resource: ResourceRef;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  actor: OrgServiceActor;
};

export type TGetResourceAwsAuthDTO = {
  resource: ResourceRef;
  actor: OrgServiceActor;
};

export type TRevokeResourceAwsAuthDTO = TGetResourceAwsAuthDTO;

export type TLoginResourceAwsAuthDTO = {
  resource: ResourceRef;
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
};

export type TAwsGetCallerIdentityHeaders = {
  "Content-Type": string;
  Host: string;
  "X-Amz-Date": string;
  "Content-Length": number;
  "x-amz-security-token": string;
  Authorization: string;
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

export type { TGenericPermission };
