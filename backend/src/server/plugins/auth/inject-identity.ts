import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt, { JwtPayload } from "jsonwebtoken";

import { TServiceTokens, TUsers } from "@app/db/schemas";
import { TScimTokenJwtPayload } from "@app/ee/services/scim/scim-types";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { ActorType, AuthMethod, AuthMode, AuthModeJwtTokenPayload, AuthTokenType } from "@app/services/auth/auth-type";
import { TIdentityAccessTokenJwtPayload } from "@app/services/identity-access-token/identity-access-token-types";

export type TAuthMode =
  | {
      authMode: AuthMode.JWT;
      actor: ActorType.USER;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
      orgId: string;
      authMethod: AuthMethod;
    }
  | {
      authMode: AuthMode.API_KEY;
      authMethod: null;
      actor: ActorType.USER;
      userId: string;
      user: TUsers;
      orgId: string;
    }
  | {
      authMode: AuthMode.SERVICE_TOKEN;
      serviceToken: TServiceTokens & { createdByEmail: string };
      actor: ActorType.SERVICE;
      serviceTokenId: string;
      orgId: string;
      authMethod: null;
    }
  | {
      authMode: AuthMode.IDENTITY_ACCESS_TOKEN;
      actor: ActorType.IDENTITY;
      identityId: string;
      identityName: string;
      orgId: string;
      authMethod: null;
    }
  | {
      authMode: AuthMode.SCIM_TOKEN;
      actor: ActorType.SCIM_CLIENT;
      scimTokenId: string;
      orgId: string;
      authMethod: null;
    };

const extractAuth = async (req: FastifyRequest, jwtSecret: string) => {
  const apiKey = req.headers?.["x-api-key"];
  if (apiKey) {
    return { authMode: AuthMode.API_KEY, token: apiKey, actor: ActorType.USER } as const;
  }
  const authHeader = req.headers?.authorization;

  if (!authHeader) return { authMode: null, token: null };

  const authTokenValue = authHeader.slice(7); // slice of after Bearer
  if (authTokenValue.startsWith("st.")) {
    return {
      authMode: AuthMode.SERVICE_TOKEN,
      token: authTokenValue,
      actor: ActorType.SERVICE
    } as const;
  }

  const decodedToken = jwt.verify(authTokenValue, jwtSecret) as JwtPayload;

  switch (decodedToken.authTokenType) {
    case AuthTokenType.ACCESS_TOKEN:
      return {
        authMode: AuthMode.JWT,
        token: decodedToken as AuthModeJwtTokenPayload,
        actor: ActorType.USER
      } as const;
    case AuthTokenType.API_KEY:
      // throw new Error("API Key auth is no longer supported.");
      return { authMode: AuthMode.API_KEY, token: decodedToken, actor: ActorType.USER } as const;
    case AuthTokenType.IDENTITY_ACCESS_TOKEN:
      return {
        authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
        token: decodedToken as TIdentityAccessTokenJwtPayload,
        actor: ActorType.IDENTITY
      } as const;
    case AuthTokenType.SCIM_TOKEN:
      return {
        authMode: AuthMode.SCIM_TOKEN,
        token: decodedToken as TScimTokenJwtPayload,
        actor: ActorType.SCIM_CLIENT
      } as const;
    default:
      return { authMode: null, token: null } as const;
  }
};

// ! Important: You can only 100% count on the `req.permission.orgId` field being present when the auth method is Identity Access Token (Machine Identity).
export const injectIdentity = fp(async (server: FastifyZodProvider) => {
  server.decorateRequest("auth", null);
  server.addHook("onRequest", async (req) => {
    const appCfg = getConfig();
    const { authMode, token, actor } = await extractAuth(req, appCfg.AUTH_SECRET);

    if (req.url.includes("/api/v3/auth/")) {
      return;
    }

    console.log("authMode", authMode);
    console.log("authMode", authMode);
    console.log("authMode", authMode);
    console.log("authMode", authMode);

    if (!authMode) return;

    console.log("authMode", authMode);

    switch (authMode) {
      case AuthMode.JWT: {
        const { user, tokenVersionId, orgId } = await server.services.authToken.fnValidateJwtIdentity(token);
        req.auth = {
          authMode: AuthMode.JWT,
          user,
          userId: user.id,
          tokenVersionId,
          actor,
          orgId: orgId as string,
          authMethod: token.authMethod
        };
        break;
      }
      case AuthMode.IDENTITY_ACCESS_TOKEN: {
        const identity = await server.services.identityAccessToken.fnValidateIdentityAccessToken(token, req.realIp);
        req.auth = {
          authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
          actor,
          orgId: identity.orgId,
          identityId: identity.identityId,
          identityName: identity.name,
          authMethod: null
        };
        break;
      }
      case AuthMode.SERVICE_TOKEN: {
        const serviceToken = await server.services.serviceToken.fnValidateServiceToken(token);
        req.auth = {
          orgId: serviceToken.orgId,
          authMode: AuthMode.SERVICE_TOKEN as const,
          serviceToken,
          serviceTokenId: serviceToken.id,
          actor,
          authMethod: null
        };
        break;
      }
      case AuthMode.API_KEY: {
        const user = await server.services.apiKey.fnValidateApiKey(token as string);
        req.auth = {
          authMode: AuthMode.API_KEY as const,
          userId: user.id,
          actor,
          user,
          orgId: "API_KEY", // We set the orgId to an arbitrary value, since we can't link an API key to a specific org. We have to deprecate API keys soon!
          authMethod: null
        };
        break;
      }
      case AuthMode.SCIM_TOKEN: {
        const { orgId, scimTokenId } = await server.services.scim.fnValidateScimToken(token);
        req.auth = { authMode: AuthMode.SCIM_TOKEN, actor, scimTokenId, orgId, authMethod: null };
        break;
      }
      default:
        throw new UnauthorizedError({ name: "Unknown token strategy" });
    }
  });
});
