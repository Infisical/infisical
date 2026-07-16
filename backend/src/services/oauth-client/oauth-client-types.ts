import { z } from "zod";

import { AuthMethod, AuthModeRefreshJwtTokenPayload, MfaMethod } from "@app/services/auth/auth-type";

export type TCreateOauthClientDTO = {
  name: string;
  description?: string;
  redirectUris: string[];
  requirePkce?: boolean;
};

export type TUpdateOauthClientDTO = {
  clientDbId: string;
  name?: string;
  description?: string | null;
  redirectUris?: string[];
  requirePkce?: boolean;
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
      grantType: "authorization_code";
      code: string;
      redirectUri?: string;
      codeVerifier?: string;
    }
  | {
      grantType: "refresh_token";
      refreshToken: string;
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
