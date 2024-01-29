import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt, { JwtPayload } from "jsonwebtoken";

import { TServiceTokens, TUsers } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import {
  ActorType,
  AuthMode,
  AuthModeJwtTokenPayload,
  AuthTokenType
} from "@app/services/auth/auth-type";
import { TIdentityAccessTokenJwtPayload } from "@app/services/identity-access-token/identity-access-token-types";

export type TAuthMode =
  | {
      authMode: AuthMode.JWT;
      actor: ActorType.USER;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
    }
  | {
      authMode: AuthMode.API_KEY;
      actor: ActorType.USER;
      userId: string;
      user: TUsers;
    }
  | {
      authMode: AuthMode.SERVICE_TOKEN;
      serviceToken: TServiceTokens;
      actor: ActorType.SERVICE;
      serviceTokenId: string;
    }
  | {
      authMode: AuthMode.IDENTITY_ACCESS_TOKEN;
      actor: ActorType.IDENTITY;
      identityId: string;
      identityName: string;
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
      return { authMode: AuthMode.API_KEY, token: decodedToken, actor: ActorType.USER } as const;
    case AuthTokenType.IDENTITY_ACCESS_TOKEN:
      return {
        authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
        token: decodedToken as TIdentityAccessTokenJwtPayload,
        actor: ActorType.IDENTITY
      } as const;
    default:
      return { authMode: null, token: null } as const;
  }
};

export const injectIdentity = fp(async (server: FastifyZodProvider) => {
  server.decorateRequest("auth", null);
  server.addHook("onRequest", async (req) => {
    const appCfg = getConfig();
    const { authMode, token, actor } = await extractAuth(req, appCfg.AUTH_SECRET);
    if (!authMode) return;

    switch (authMode) {
      case AuthMode.JWT: {
        const { user, tokenVersionId } =
          await server.services.authToken.fnValidateJwtIdentity(token);
        req.auth = { authMode: AuthMode.JWT, user, userId: user.id, tokenVersionId, actor };
        break;
      }
      case AuthMode.IDENTITY_ACCESS_TOKEN: {
        const identity = await server.services.identityAccessToken.fnValidateIdentityAccessToken(
          token,
          req.realIp
        );
        req.auth = {
          authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
          actor,
          identityId: identity.identityId,
          identityName: identity.name
        };
        break;
      }
      case AuthMode.SERVICE_TOKEN: {
        const serviceToken = await server.services.serviceToken.fnValidateServiceToken(
          token as string
        );
        req.auth = {
          authMode: AuthMode.SERVICE_TOKEN as const,
          serviceToken,
          serviceTokenId: serviceToken.id,
          actor
        };
        break;
      }
      case AuthMode.API_KEY: {
        const user = await server.services.apiKey.fnValidateApiKey(token as string);
        req.auth = { authMode: AuthMode.API_KEY as const, userId: user.id, actor, user };
        break;
      }
      default:
        throw new UnauthorizedError({ name: "Unknown token strategy" });
    }
  });
});
