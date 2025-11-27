export type TRenewAccessTokenDTO = {
  accessToken: string;
};

export type TIdentityAccessTokenJwtPayload = {
  identityId: string;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
  subOrganizationId?: string;
  identityAuth: {
    oidc?: {
      claims: Record<string, string>;
    };
    kubernetes?: {
      namespace: string;
      name: string;
    };
    aws?: {
      accountId: string;
      arn: string;
      userId: string;

      // Derived from ARN
      partition: string; // "aws", "aws-gov", "aws-cn"
      service: string; // "iam", "sts"
      resourceType: string; // "user" or "role"
      resourceName: string;
    };
  };
};
