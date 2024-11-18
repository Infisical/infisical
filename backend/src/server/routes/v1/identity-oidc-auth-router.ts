import { z } from "zod";

import { IdentityOidcAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { OIDC_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import {
  validateOidcAuthAudiencesField,
  validateOidcBoundClaimsField
} from "@app/services/identity-oidc-auth/identity-oidc-auth-validators";

const IdentityOidcAuthResponseSchema = IdentityOidcAuthsSchema.omit({
  encryptedCaCert: true,
  caCertIV: true,
  caCertTag: true
}).extend({
  caCert: z.string()
});

export const registerIdentityOidcAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/oidc-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with OIDC Auth",
      body: z.object({
        identityId: z.string().trim().describe(OIDC_AUTH.LOGIN.identityId),
        jwt: z.string().trim()
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      const { identityOidcAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityOidcAuth.login({
          identityId: req.body.identityId,
          jwt: req.body.jwt
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityOidcAuthId: identityOidcAuth.id
          }
        }
      });
      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityOidcAuth.accessTokenTTL,
        accessTokenMaxTTL: identityOidcAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/oidc-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach OIDC Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(OIDC_AUTH.ATTACH.identityId)
      }),
      body: z.object({
        oidcDiscoveryUrl: z.string().url().min(1).describe(OIDC_AUTH.ATTACH.oidcDiscoveryUrl),
        caCert: z.string().trim().default("").describe(OIDC_AUTH.ATTACH.caCert),
        boundIssuer: z.string().min(1).describe(OIDC_AUTH.ATTACH.boundIssuer),
        boundAudiences: validateOidcAuthAudiencesField.describe(OIDC_AUTH.ATTACH.boundAudiences),
        boundClaims: validateOidcBoundClaimsField.describe(OIDC_AUTH.ATTACH.boundClaims),
        boundSubject: z.string().optional().default("").describe(OIDC_AUTH.ATTACH.boundSubject),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
          .describe(OIDC_AUTH.ATTACH.accessTokenTrustedIps),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000)
          .describe(OIDC_AUTH.ATTACH.accessTokenTTL),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000)
          .describe(OIDC_AUTH.ATTACH.accessTokenMaxTTL),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(OIDC_AUTH.ATTACH.accessTokenNumUsesLimit)
      }),
      response: {
        200: z.object({
          identityOidcAuth: IdentityOidcAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityOidcAuth = await server.services.identityOidcAuth.attachOidcAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOidcAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId,
            oidcDiscoveryUrl: identityOidcAuth.oidcDiscoveryUrl,
            caCert: identityOidcAuth.caCert,
            boundIssuer: identityOidcAuth.boundIssuer,
            boundAudiences: identityOidcAuth.boundAudiences,
            boundClaims: identityOidcAuth.boundClaims as Record<string, string>,
            boundSubject: identityOidcAuth.boundSubject as string,
            accessTokenTTL: identityOidcAuth.accessTokenTTL,
            accessTokenMaxTTL: identityOidcAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityOidcAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityOidcAuth.accessTokenNumUsesLimit
          }
        }
      });

      return {
        identityOidcAuth
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/oidc-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update OIDC Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(OIDC_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          oidcDiscoveryUrl: z.string().url().min(1).describe(OIDC_AUTH.UPDATE.oidcDiscoveryUrl),
          caCert: z.string().trim().default("").describe(OIDC_AUTH.UPDATE.caCert),
          boundIssuer: z.string().min(1).describe(OIDC_AUTH.UPDATE.boundIssuer),
          boundAudiences: validateOidcAuthAudiencesField.describe(OIDC_AUTH.UPDATE.boundAudiences),
          boundClaims: validateOidcBoundClaimsField.describe(OIDC_AUTH.UPDATE.boundClaims),
          boundSubject: z.string().optional().default("").describe(OIDC_AUTH.UPDATE.boundSubject),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(OIDC_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(1)
            .max(315360000)
            .refine((value) => value !== 0, {
              message: "accessTokenTTL must have a non zero number"
            })
            .default(2592000)
            .describe(OIDC_AUTH.UPDATE.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .refine((value) => value !== 0, {
              message: "accessTokenMaxTTL must have a non zero number"
            })
            .default(2592000)
            .describe(OIDC_AUTH.UPDATE.accessTokenMaxTTL),

          accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(OIDC_AUTH.UPDATE.accessTokenNumUsesLimit)
        })
        .partial(),
      response: {
        200: z.object({
          identityOidcAuth: IdentityOidcAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityOidcAuth = await server.services.identityOidcAuth.updateOidcAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOidcAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId,
            oidcDiscoveryUrl: identityOidcAuth.oidcDiscoveryUrl,
            caCert: identityOidcAuth.caCert,
            boundIssuer: identityOidcAuth.boundIssuer,
            boundAudiences: identityOidcAuth.boundAudiences,
            boundClaims: identityOidcAuth.boundClaims as Record<string, string>,
            boundSubject: identityOidcAuth.boundSubject as string,
            accessTokenTTL: identityOidcAuth.accessTokenTTL,
            accessTokenMaxTTL: identityOidcAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityOidcAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityOidcAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityOidcAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/oidc-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Retrieve OIDC Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(OIDC_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityOidcAuth: IdentityOidcAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityOidcAuth = await server.services.identityOidcAuth.getOidcAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOidcAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId
          }
        }
      });

      return { identityOidcAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/oidc-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete OIDC Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(OIDC_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityOidcAuth: IdentityOidcAuthResponseSchema.omit({
            caCert: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityOidcAuth = await server.services.identityOidcAuth.revokeOidcAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOidcAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId
          }
        }
      });

      return { identityOidcAuth };
    }
  });
};
