import { requestContext, RequestContextData } from "@fastify/request-context";
import { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { JwtPayload } from "jsonwebtoken";

import { TServiceTokens, TUsers } from "@app/db/schemas";
import { TScimTokenJwtPayload } from "@app/ee/services/scim/scim-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { slugSchema } from "@app/server/lib/schemas";
import { ActorType, AuthMethod, AuthMode, AuthModeJwtTokenPayload, AuthTokenType } from "@app/services/auth/auth-type";
import { TIdentityAccessTokenJwtPayload } from "@app/services/identity-access-token/identity-access-token-types";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

export type TAuthMode =
  | {
      authMode: AuthMode.JWT;
      actor: ActorType.USER;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
      orgId: string;
      rootOrgId: string;
      parentOrgId: string;
      authMethod: AuthMethod;
      isMfaVerified?: boolean;
      token: AuthModeJwtTokenPayload;
    }
  | {
      authMode: AuthMode.API_KEY;
      authMethod: null;
      actor: ActorType.USER;
      userId: string;
      user: TUsers;
      orgId: string;
      rootOrgId: string;
      parentOrgId: string;
      token: string;
    }
  | {
      authMode: AuthMode.SERVICE_TOKEN;
      serviceToken: TServiceTokens & { createdByEmail: string };
      actor: ActorType.SERVICE;
      serviceTokenId: string;
      orgId: string;
      rootOrgId: string;
      parentOrgId: string;
      authMethod: null;
      token: string;
    }
  | {
      authMode: AuthMode.IDENTITY_ACCESS_TOKEN;
      actor: ActorType.IDENTITY;
      identityId: string;
      identityName: string;
      orgId: string;
      rootOrgId: string;
      parentOrgId: string;
      authMethod: null;
      isInstanceAdmin?: boolean;
      token: TIdentityAccessTokenJwtPayload;
    }
  | {
      authMode: AuthMode.SCIM_TOKEN;
      actor: ActorType.SCIM_CLIENT;
      scimTokenId: string;
      orgId: string;
      rootOrgId: string;
      parentOrgId: string;
      authMethod: null;
    };

export const extractAuth = async (req: FastifyRequest, jwtSecret: string) => {
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

  const decodedToken = crypto.jwt().verify(authTokenValue, jwtSecret) as JwtPayload;

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
export const injectIdentity = fp(
  async (server: FastifyZodProvider, opt: { shouldForwardWritesToPrimaryInstance?: boolean }) => {
    server.decorateRequest("auth", null);
    server.decorateRequest("shouldForwardWritesToPrimaryInstance", Boolean(opt.shouldForwardWritesToPrimaryInstance));
    server.addHook("onRequest", async (req) => {
      const appCfg = getConfig();

      if (opt.shouldForwardWritesToPrimaryInstance && req.method !== "GET") {
        return;
      }

      if (req.url.includes(".well-known/est") || req.url.includes("/api/v3/auth/")) {
        return;
      }

      // Authentication is handled on a route-level
      if (req.url === "/api/v1/relays/register-instance-relay") {
        return;
      }

      // Authentication is handled on a route-level
      if (req.url === "/api/v1/relays/heartbeat-instance-relay") {
        return;
      }

      // Authentication is handled on a route-level here.
      if (req.url.includes("/api/v1/workflow-integrations/microsoft-teams/message-endpoint")) {
        return;
      }

      const { authMode, token, actor } = await extractAuth(req, appCfg.AUTH_SECRET);

      if (!authMode) return;

      const subOrganizationSelector = req.headers?.["x-infisical-org"] as string | undefined;
      if (subOrganizationSelector) {
        await slugSchema().parseAsync(subOrganizationSelector);
      }

      switch (authMode) {
        case AuthMode.JWT: {
          const { user, tokenVersionId, orgId, orgName, rootOrgId, parentOrgId } =
            await server.services.authToken.fnValidateJwtIdentity(token, subOrganizationSelector);
          requestContext.set("orgId", orgId);
          requestContext.set("orgName", orgName);
          requestContext.set("userAuthInfo", { userId: user.id, email: user.email || "" });
          req.auth = {
            authMode: AuthMode.JWT,
            user,
            userId: user.id,
            tokenVersionId,
            actor,
            orgId,
            rootOrgId,
            parentOrgId,
            authMethod: token.authMethod,
            isMfaVerified: token.isMfaVerified,
            token
          };
          break;
        }
        case AuthMode.IDENTITY_ACCESS_TOKEN: {
          const identity = await server.services.identityAccessToken.fnValidateIdentityAccessToken(
            token,
            req.realIp,
            subOrganizationSelector
          );
          const serverCfg = await getServerCfg();
          requestContext.set("orgId", identity.orgId);
          requestContext.set("orgName", identity.orgName);
          req.auth = {
            authMode: AuthMode.IDENTITY_ACCESS_TOKEN,
            actor,
            orgId: identity.orgId,
            rootOrgId: identity.rootOrgId,
            parentOrgId: identity.parentOrgId,
            identityId: identity.identityId,
            identityName: identity.identityName,
            authMethod: null,
            isInstanceAdmin: serverCfg?.adminIdentityIds?.includes(identity.identityId),
            token
          };
          const identityAuthInfo: RequestContextData["identityAuthInfo"] = {
            identityId: identity.identityId,
            identityName: identity.name,
            authMethod: identity.authMethod
          };

          if (token?.identityAuth?.oidc) {
            identityAuthInfo.oidc = token?.identityAuth?.oidc;
          }
          if (token?.identityAuth?.kubernetes) {
            identityAuthInfo.kubernetes = token?.identityAuth?.kubernetes;
          }
          if (token?.identityAuth?.aws) {
            identityAuthInfo.aws = token?.identityAuth?.aws;
          }

          requestContext.set("identityAuthInfo", identityAuthInfo);
          break;
        }
        case AuthMode.SERVICE_TOKEN: {
          const serviceToken = await server.services.serviceToken.fnValidateServiceToken(token);
          requestContext.set("orgId", serviceToken.orgId);

          if (subOrganizationSelector)
            throw new BadRequestError({ message: `Service token doesn't support sub organization selector` });

          req.auth = {
            orgId: serviceToken.orgId,
            rootOrgId: serviceToken.rootOrgId,
            parentOrgId: serviceToken.parentOrgId,
            authMode: AuthMode.SERVICE_TOKEN as const,
            serviceToken,
            serviceTokenId: serviceToken.id,
            actor,
            authMethod: null,
            token
          };
          break;
        }
        case AuthMode.API_KEY: {
          throw new BadRequestError({
            message: "API key authentication is not supported anymore. Please switch to identity authentication."
          });
        }
        case AuthMode.SCIM_TOKEN: {
          const { orgId, scimTokenId } = await server.services.scim.fnValidateScimToken(token);
          requestContext.set("orgId", orgId);

          if (subOrganizationSelector)
            throw new BadRequestError({ message: `SCIM token doesn't support sub organization selector` });

          req.auth = {
            authMode: AuthMode.SCIM_TOKEN,
            actor,
            scimTokenId,
            orgId,
            authMethod: null,
            // scim cannot be done for sub organization
            rootOrgId: orgId,
            parentOrgId: orgId
          };
          break;
        }
        default:
          throw new BadRequestError({ message: "Invalid token strategy provided" });
      }
    });
  }
);
