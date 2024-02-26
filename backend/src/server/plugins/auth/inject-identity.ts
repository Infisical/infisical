import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import jwt, { JwtPayload } from "jsonwebtoken";

import { TServiceTokens, TUsers } from "@app/db/schemas";
import { TScimTokenJwtPayload } from "@app/ee/services/scim/scim-types";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { ActorType, AuthMode, AuthModeJwtTokenPayload, AuthTokenType } from "@app/services/auth/auth-type";
import { TIdentityAccessTokenJwtPayload } from "@app/services/identity-access-token/identity-access-token-types";

export type TAuthMode =
  | {
      authMode: AuthMode.JWT;
      actor: ActorType.USER;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
      orgId?: string;
    }
  | {
      authMode: AuthMode.API_KEY;
      actor: ActorType.USER;
      userId: string;
      user: TUsers;
      orgId?: string;
    }
  | {
      authMode: AuthMode.SERVICE_TOKEN;
      serviceToken: TServiceTokens & { createdByEmail: string };
      actor: ActorType.SERVICE;
      serviceTokenId: string;
      orgId: string;
    }
  | {
      authMode: AuthMode.IDENTITY_ACCESS_TOKEN;
      actor: ActorType.IDENTITY;
      identityId: string;
      identityName: string;
      orgId: string;
    }
  | {
      authMode: AuthMode.SCIM_TOKEN;
      actor: ActorType.SCIM_CLIENT;
      scimTokenId: string;
      orgId: string;
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

/*
!!! IMPORTANT NOTE ABOUT `orgId` FIELD on `req.auth` !!!

The `orgId` is an optional field, this is intentional. 
There are cases where the `orgId` won't be present on the request auth object.


2 Examples:

1. When a user first creates their account, no organization is present most of the time, because they haven't created one yet.
2. When a user is using an API key. We can't link API keys to organizations, because they are not tied to any organization, but instead they're tied to the user itself.


Reasons for orgId to be undefined when JWT is used, is to indicate that a certain token was obtained from successfully logging into an org with org-level auth enforced.
Certain organizations don’t require that enforcement and so the tokens don’t have organizationId on them.
They shouldn’t be used to access organizations that have specific org-level auth enforced
And so to differentiate between tokens that were obtained from regular login vs those at the org-auth level we include that field into those tokens.

*/

export const injectIdentity = fp(async (server: FastifyZodProvider) => {
  server.decorateRequest("auth", null);
  server.addHook("onRequest", async (req) => {
    const appCfg = getConfig();
    const { authMode, token, actor } = await extractAuth(req, appCfg.AUTH_SECRET);
    if (!authMode) return;

    switch (authMode) {
      // May or may not have an orgId. If it doesn't have an org ID, it's likely because the token is from an org that doesn't enforce org-level auth.
      case AuthMode.JWT: {
        const { user, tokenVersionId, orgId } = await server.services.authToken.fnValidateJwtIdentity(token);
        req.auth = { authMode: AuthMode.JWT, user, userId: user.id, tokenVersionId, actor, orgId };
        break;
      }
      // Will always contain an orgId.
      case AuthMode.IDENTITY_ACCESS_TOKEN: {
        const identity = await server.services.identityAccessToken.fnValidateIdentityAccessToken(token, req.realIp);
        req.auth = {
          authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
          actor,
          orgId: identity.orgId,
          identityId: identity.identityId,
          identityName: identity.name
        };
        break;
      }
      // Will always contain an orgId.
      case AuthMode.SERVICE_TOKEN: {
        const serviceToken = await server.services.serviceToken.fnValidateServiceToken(token);
        req.auth = {
          authMode: AuthMode.SERVICE_TOKEN as const,
          serviceToken,
          orgId: serviceToken.orgId,
          serviceTokenId: serviceToken.id,
          actor
        };
        break;
      }
      // Will never contain an orgId. API keys are not tied to an organization.
      case AuthMode.API_KEY: {
        const user = await server.services.apiKey.fnValidateApiKey(token as string);
        req.auth = { authMode: AuthMode.API_KEY as const, userId: user.id, actor, user };
        break;
      }
      // OK
      case AuthMode.SCIM_TOKEN: {
        const { orgId, scimTokenId } = await server.services.scim.fnValidateScimToken(token);
        req.auth = { authMode: AuthMode.SCIM_TOKEN, actor, scimTokenId, orgId };
        break;
      }
      default:
        throw new UnauthorizedError({ name: "Unknown token strategy" });
    }
  });
});
