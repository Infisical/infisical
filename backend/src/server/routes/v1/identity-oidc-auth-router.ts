import { z } from "zod";

import { IdentityOidcAuthsSchema } from "@app/db/schemas/identity-oidc-auths";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, OIDC_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import {
  validateOidcAuthAudiencesField,
  validateOidcBoundClaimsField
} from "@app/services/identity-oidc-auth/identity-oidc-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const IdentityOidcAuthResponseSchema = IdentityOidcAuthsSchema.pick({
  id: true,
  accessTokenTTL: true,
  accessTokenMaxTTL: true,
  accessTokenNumUsesLimit: true,
  accessTokenTrustedIps: true,
  identityId: true,
  oidcDiscoveryUrl: true,
  boundIssuer: true,
  boundAudiences: true,
  boundClaims: true,
  claimMetadataMapping: true,
  boundSubject: true,
  createdAt: true,
  updatedAt: true
}).extend({
  caCert: z.string()
});

const MAX_OIDC_CLAIM_SIZE = 32_768;

export const registerIdentityOidcAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/oidc-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithOidcAuth",
      tags: [ApiDocsTags.OidcAuth],
      description: "Login with OIDC Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(OIDC_AUTH.LOGIN.identityId),
        jwt: z.string().trim(),
        subOrganizationName: slugSchema().optional().describe(OIDC_AUTH.LOGIN.subOrganizationName)
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
      const { identityOidcAuth, accessToken, identityAccessToken, identity, oidcTokenData } =
        await server.services.identityOidcAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_OIDC_AUTH,
          metadata: {
            identityId: identityOidcAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityOidcAuthId: identityOidcAuth.id,
            oidcClaimsReceived:
              Buffer.from(JSON.stringify(oidcTokenData), "utf8").byteLength < MAX_OIDC_CLAIM_SIZE
                ? oidcTokenData
                : { payload: "Error: Payload exceeds 32KB, provided oidc claim not recorded in audit log." }
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
      hide: false,
      operationId: "attachOidcAuth",
      tags: [ApiDocsTags.OidcAuth],
      description: "Attach OIDC Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(OIDC_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          oidcDiscoveryUrl: z.string().url().min(1).describe(OIDC_AUTH.ATTACH.oidcDiscoveryUrl),
          caCert: z.string().trim().default("").describe(OIDC_AUTH.ATTACH.caCert),
          boundIssuer: z.string().min(1).describe(OIDC_AUTH.ATTACH.boundIssuer),
          boundAudiences: validateOidcAuthAudiencesField.describe(OIDC_AUTH.ATTACH.boundAudiences),
          boundClaims: validateOidcBoundClaimsField.describe(OIDC_AUTH.ATTACH.boundClaims),
          claimMetadataMapping: validateOidcBoundClaimsField.describe(OIDC_AUTH.ATTACH.claimMetadataMapping).optional(),
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
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(OIDC_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(OIDC_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(OIDC_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
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
        identityId: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
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
            claimMetadataMapping: identityOidcAuth.claimMetadataMapping as Record<string, string>,
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
      hide: false,
      operationId: "updateOidcAuth",
      tags: [ApiDocsTags.OidcAuth],
      description: "Update OIDC Auth configuration on machine identity",
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
          claimMetadataMapping: validateOidcBoundClaimsField.describe(OIDC_AUTH.UPDATE.claimMetadataMapping).optional(),
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
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(OIDC_AUTH.UPDATE.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(OIDC_AUTH.UPDATE.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(OIDC_AUTH.UPDATE.accessTokenNumUsesLimit)
        })
        .partial()
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
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
            claimMetadataMapping: identityOidcAuth.claimMetadataMapping as Record<string, string>,
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
      hide: false,
      operationId: "getOidcAuth",
      tags: [ApiDocsTags.OidcAuth],
      description: "Retrieve OIDC Auth configuration on machine identity",
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
      hide: false,
      operationId: "deleteOidcAuth",
      tags: [ApiDocsTags.OidcAuth],
      description: "Delete OIDC Auth configuration on machine identity",
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
