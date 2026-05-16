import { IdentityAuthMethod } from "@app/db/schemas";

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

// Custom claims the identity access token JWT carries for stateless TTL/auth
// context. `jti`, `iat`, and `exp` come from the JWT spec — declared here for
// post-verify typing.
//
// `accessTokenTTL`, `accessTokenMaxTTL`, and `accessTokenPeriod` are mirrored
// into every renewed JWT so the renew flow can recompute caps without loading
// a token row (the row may not exist for non-Token-Auth methods under the
// lazy-insert model).
//
// `creationEpoch` anchors the maxTTL lifetime budget across renewals. JWT `iat`
// is restamped on every renewal, so it cannot anchor "since creation" — this
// claim is set at first issuance and copied through unchanged on renew.
export type TIdentityAccessTokenJwtPayload = {
  jti?: string;
  iat?: number;
  exp?: number;
  identityId: string;
  identityName?: string;
  authMethod?: IdentityAuthMethod;
  orgId?: string;
  rootOrgId?: string;
  parentOrgId?: string;
  numUsesLimit?: number;
  ipRestrictionEnabled?: boolean;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenPeriod?: number;
  creationEpoch?: number;
  identityAuth: {
    oidc?: TOidcAuthDetails;
    kubernetes?: TKubernetesAuthDetails;
    aws?: TAWSAuthDetails;
  };
};

// Claims present on every JWT we accept (legacy + new format). Pre-redesign
// JWTs lacked `jti` but always carried `identityAccessTokenId`, so that's the
// stable token id across both formats.
export type TCoreTokenClaims = TIdentityAccessTokenJwtPayload & {
  iat: number;
  identityId: string;
  identityAccessTokenId: string;
};

// Same shape as core; named here for call-site clarity in the renew flow.
export type TMinimalRenewClaims = TCoreTokenClaims;

// Same shape as core; named here for call-site clarity in the revoke flow.
export type TRevocableClaims = TCoreTokenClaims;

// New-format JWTs carry every claim needed to auth/renew without a PG read.
// `creationEpoch` anchors the maxTTL budget across renewals.
export type TRenewableClaims = TMinimalRenewClaims & {
  jti: string;
  authMethod: IdentityAuthMethod;
  orgId: string;
  rootOrgId: string;
  parentOrgId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenPeriod: number;
  creationEpoch: number;
};

// Resolved auth/renew context — parsed from new-format claims or loaded from
// PG for legacy tokens. Auth uses a subset; renew uses every field.
export type TRenewSource = {
  authMethod: IdentityAuthMethod;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenPeriod: number;
  creationEpoch: number;
  identityName: string;
  orgId: string;
  rootOrgId: string;
  parentOrgId: string;
  clientSecretId: string;
  numUsesLimit: number;
  identityAuth?: TIdentityAccessTokenJwtPayload["identityAuth"];
};

export type TComputeIssuedTtlInput = {
  requestedTTL: number;
  maxTTL: number;
  creationEpoch: number;
  nowSeconds: number;
};

export type TSignIdentityAccessTokenInput = {
  identityAccessTokenId: string;
  identityId: string;
  identityName: string;
  authMethod: IdentityAuthMethod;
  orgId: string;
  rootOrgId: string;
  parentOrgId: string;
  clientSecretId: string;
  numUsesLimit: number;
  ipRestrictionEnabled: boolean;
  ttlSeconds: number;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenPeriod: number;
  creationEpoch: number;
  identityAuth?: {
    oidc?: TOidcAuthDetails;
    kubernetes?: TKubernetesAuthDetails;
    aws?: TAWSAuthDetails;
  };
};

export type TSignIdentityAccessTokenOutput = {
  accessToken: string;
  jti: string;
  expiresIn: number;
};
