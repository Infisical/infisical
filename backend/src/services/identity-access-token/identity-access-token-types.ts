export type TRenewAccessTokenDTO = {
  accessToken: string;
};

export type TOidcAuthDetails = {
  claims: Record<string, string>;
};

export type TAWSAuthDetails = {
  accountId: string;
  arn: string;
  userId: string;

  // Derived from ARN
  partition: string; // "aws", "aws-gov", "aws-cn"
  service: string; // "iam", "sts"
  resourceType: string; // "user" or "role"
  resourceName: string;
};

export type TKubernetesAuthDetails = {
  namespace: string;
  name: string;
};

export type TIdentityAccessTokenJwtPayload = {
  identityId: string;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
  identityAuth: {
    oidc?: TOidcAuthDetails;
    kubernetes?: TKubernetesAuthDetails;
    aws?: TAWSAuthDetails;
  };
};
