export type ResourceType = "gateway";

export type ResourceRef = { type: ResourceType; id: string };

export type AuthMethodKind = "aws" | "token";

export type ResourceAwsAuth = {
  id: string;
  gatewayId: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  createdAt: string;
  updatedAt: string;
};

export type ResourceTokenAuth = {
  id: string;
  gatewayId: string;
  createdAt: string;
  updatedAt: string;
};

export type AttachedAuthMethod =
  | { method: "aws"; config: ResourceAwsAuth }
  | { method: "token"; config: ResourceTokenAuth };

export type AttachAwsAuthDTO = {
  resource: ResourceRef;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
};

export type UpdateAwsAuthDTO = {
  resource: ResourceRef;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
};

export type AttachTokenAuthDTO = {
  resource: ResourceRef;
};
