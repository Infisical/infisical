import { z } from "zod";

import { AuthMethod, AuthModeRefreshJwtTokenPayload, MfaMethod } from "@app/services/auth/auth-type";

// RFC 7591 client metadata. A client can hold several grants, and each grant makes a different subset
// of the client's fields meaningful. See assertValidOauthClientGrantConfig.
export enum OauthGrantType {
  AuthorizationCode = "authorization_code",
  RefreshToken = "refresh_token",
  TokenExchange = "urn:ietf:params:oauth:grant-type:token-exchange"
}

// Applied as the create default so an API caller written before this feature, which sends no
// `grantTypes`, keeps registering redirect-flow applications.
export const DEFAULT_OAUTH_GRANT_TYPES: readonly OauthGrantType[] = [
  OauthGrantType.AuthorizationCode,
  OauthGrantType.RefreshToken
];

// RFC 8693 section 3 token type identifiers.
export enum OauthTokenType {
  Jwt = "urn:ietf:params:oauth:token-type:jwt",
  IdToken = "urn:ietf:params:oauth:token-type:id_token",
  AccessToken = "urn:ietf:params:oauth:token-type:access_token"
}

// Both are verified identically, as a signed JWT from the org's OIDC SSO issuer, so the difference is
// only what the caller declares.
export const ACCEPTED_SUBJECT_TOKEN_TYPES: readonly OauthTokenType[] = [OauthTokenType.Jwt, OauthTokenType.IdToken];

// Marks a token as carrying the user's authorization unnarrowed, as opposed to the consented scopes an
// authorization-code token carries.
//
// Deliberately a positive marker rather than an absent `scopes` claim: absence has to keep meaning zero
// permissions, so that dropping the claim by mistake fails closed.
export enum OauthDelegationMode {
  Full = "full"
}

export type TCreateOauthClientDTO = {
  name: string;
  description?: string;
  grantTypes: OauthGrantType[];
  redirectUris: string[];
  requirePkce?: boolean;
  tokenExchangeAudience?: string;
  tokenExchangeIdpSatisfiesMfa?: boolean;
};

export type TUpdateOauthClientDTO = {
  clientDbId: string;
  name?: string;
  description?: string | null;
  grantTypes?: OauthGrantType[];
  redirectUris?: string[];
  requirePkce?: boolean;
  tokenExchangeAudience?: string | null;
  tokenExchangeIdpSatisfiesMfa?: boolean;
};

export type TOauthAuthorizeInfoDTO = {
  clientId: string;
  redirectUri: string;
  scope?: string;
};

export type TOauthConsentDTO = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
  scope?: string;
  userId: string;
  authMethod: AuthMethod;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
  ip: string;
};

export type TOauthTokenExchangeDTO = {
  clientId?: string;
  clientSecret?: string;
} & (
  | {
      grantType: OauthGrantType.AuthorizationCode;
      code: string;
      redirectUri?: string;
      codeVerifier?: string;
    }
  | {
      grantType: OauthGrantType.RefreshToken;
      refreshToken: string;
    }
  | {
      grantType: OauthGrantType.TokenExchange;
      subjectToken: string;
      subjectTokenType: OauthTokenType;
      ip: string;
      userAgent?: string;
    }
);

export const OauthAuthorizationCodePayloadSchema = z.object({
  clientId: z.string(),
  orgId: z.string(),
  userId: z.string(),
  authMethod: z.nativeEnum(AuthMethod),
  isMfaVerified: z.boolean().optional(),
  mfaMethod: z.nativeEnum(MfaMethod).optional(),
  tokenVersionId: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string().optional(),
  codeChallengeMethod: z.literal("S256").optional(),
  // Granted, validated delegation scopes (recognized OauthScope values only). Resolved at consent
  // time so the token exchange does not have to re-parse the original space-delimited request.
  scopes: z.array(z.string()).optional()
});

export type TOauthRefreshJwtTokenPayload = AuthModeRefreshJwtTokenPayload & {
  oauthClientId?: string;
};
