import { z } from "zod";

import { IdentitySpiffeAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SPIFFE_AUTH } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { SpiffeTrustBundleProfile } from "@app/services/identity-spiffe-auth/identity-spiffe-auth-types";
import {
  validateSpiffeAllowedAudiencesField,
  validateSpiffeAllowedIdsField,
  validateTrustDomain
} from "@app/services/identity-spiffe-auth/identity-spiffe-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const StaticTrustBundleSchema = z.object({
  profile: z.literal(SpiffeTrustBundleProfile.STATIC).describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.profile),
  bundle: z.string().min(1).describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.bundle)
});

const HttpsWebBundleSchema = z.object({
  profile: z
    .literal(SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE)
    .describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.profile),
  endpointUrl: z
    .string()
    .trim()
    .url()
    .refine((url) => url.startsWith("https://"), "Bundle endpoint URL must use HTTPS")
    .describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.endpointUrl),
  caCert: z.string().optional().describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.caCert),
  refreshHintSeconds: z
    .number()
    .int()
    .min(0)
    .default(3600)
    .describe(SPIFFE_AUTH.ATTACH.trustBundleDistribution.refreshHintSeconds)
});

const TrustBundleDistributionSchema = z.discriminatedUnion("profile", [StaticTrustBundleSchema, HttpsWebBundleSchema]);

const StaticTrustBundleResponseSchema = z.object({
  profile: z.literal(SpiffeTrustBundleProfile.STATIC),
  bundle: z.string()
});

const HttpsWebBundleResponseSchema = z.object({
  profile: z.literal(SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE),
  endpointUrl: z.string(),
  caCert: z.string(),
  refreshHintSeconds: z.number(),
  cachedBundleLastRefreshedAt: z.date().nullable().optional()
});

const TrustBundleDistributionResponseSchema = z.discriminatedUnion("profile", [
  StaticTrustBundleResponseSchema,
  HttpsWebBundleResponseSchema
]);

const IdentitySpiffeAuthResponseSchema = IdentitySpiffeAuthsSchema.pick({
  id: true,
  identityId: true,
  trustDomain: true,
  allowedSpiffeIds: true,
  allowedAudiences: true,
  accessTokenTTL: true,
  accessTokenMaxTTL: true,
  accessTokenNumUsesLimit: true,
  accessTokenTrustedIps: true,
  createdAt: true,
  updatedAt: true
}).extend({
  trustBundleDistribution: TrustBundleDistributionResponseSchema
});

const CommonCreateFields = z.object({
  trustDomain: validateTrustDomain.describe(SPIFFE_AUTH.ATTACH.trustDomain),
  allowedSpiffeIds: validateSpiffeAllowedIdsField.describe(SPIFFE_AUTH.ATTACH.allowedSpiffeIds),
  allowedAudiences: validateSpiffeAllowedAudiencesField.describe(SPIFFE_AUTH.ATTACH.allowedAudiences),
  trustBundleDistribution: TrustBundleDistributionSchema,
  accessTokenTrustedIps: z
    .object({
      ipAddress: z.string().trim()
    })
    .array()
    .min(1)
    .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
    .describe(SPIFFE_AUTH.ATTACH.accessTokenTrustedIps),
  accessTokenTTL: z.number().int().min(0).max(315360000).default(2592000).describe(SPIFFE_AUTH.ATTACH.accessTokenTTL),
  accessTokenMaxTTL: z
    .number()
    .int()
    .min(0)
    .max(315360000)
    .default(2592000)
    .describe(SPIFFE_AUTH.ATTACH.accessTokenMaxTTL),
  accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(SPIFFE_AUTH.ATTACH.accessTokenNumUsesLimit)
});

const CommonUpdateFields = CommonCreateFields.partial();

export const registerIdentitySpiffeAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/spiffe-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithSpiffeAuth",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Login with SPIFFE Auth (JWT-SVID) for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(SPIFFE_AUTH.LOGIN.identityId),
        jwt: z.string().trim().describe(SPIFFE_AUTH.LOGIN.jwt),
        organizationSlug: slugSchema().optional().describe(SPIFFE_AUTH.LOGIN.organizationSlug)
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
      try {
        const { identitySpiffeAuth, accessToken, identityAccessToken, identity } =
          await server.services.identitySpiffeAuth.login(req.body);

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: identity.orgId,
          event: {
            type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH,
            metadata: {
              identityId: identitySpiffeAuth.identityId,
              identityAccessTokenId: identityAccessToken.id,
              identitySpiffeAuthId: identitySpiffeAuth.id
            }
          }
        });
        return {
          accessToken,
          tokenType: "Bearer" as const,
          expiresIn: identitySpiffeAuth.accessTokenTTL,
          accessTokenMaxTTL: identitySpiffeAuth.accessTokenMaxTTL
        };
      } catch (error) {
        if (error instanceof UnauthorizedError && error.detail?.orgId && error.detail?.identityId) {
          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            actor: { type: ActorType.UNKNOWN_USER, metadata: {} },
            orgId: error.detail.orgId as string,
            event: {
              type: EventType.LOGIN_IDENTITY_SPIFFE_AUTH_FAILED,
              metadata: {
                identityId: error.detail.identityId as string,
                reason: error.detail.reason as string,
                message: error.message
              }
            }
          });
        }
        throw error;
      }
    }
  });

  server.route({
    method: "POST",
    url: "/spiffe-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachSpiffeAuth",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Attach SPIFFE Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(SPIFFE_AUTH.ATTACH.identityId)
      }),
      body: CommonCreateFields,
      response: {
        200: z.object({
          identitySpiffeAuth: IdentitySpiffeAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identitySpiffeAuth = await server.services.identitySpiffeAuth.attachSpiffeAuth({
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
        orgId: identitySpiffeAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_SPIFFE_AUTH,
          metadata: {
            identityId: identitySpiffeAuth.identityId,
            trustDomain: identitySpiffeAuth.trustDomain,
            allowedSpiffeIds: identitySpiffeAuth.allowedSpiffeIds,
            allowedAudiences: identitySpiffeAuth.allowedAudiences,
            configurationType: identitySpiffeAuth.trustBundleDistribution.profile,
            accessTokenTTL: identitySpiffeAuth.accessTokenTTL,
            accessTokenMaxTTL: identitySpiffeAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identitySpiffeAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identitySpiffeAuth.accessTokenNumUsesLimit
          }
        }
      });

      return {
        identitySpiffeAuth
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/spiffe-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateSpiffeAuth",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Update SPIFFE Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(SPIFFE_AUTH.UPDATE.identityId)
      }),
      body: CommonUpdateFields,
      response: {
        200: z.object({
          identitySpiffeAuth: IdentitySpiffeAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identitySpiffeAuth = await server.services.identitySpiffeAuth.updateSpiffeAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identitySpiffeAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_SPIFFE_AUTH,
          metadata: {
            identityId: identitySpiffeAuth.identityId,
            trustDomain: identitySpiffeAuth.trustDomain,
            allowedSpiffeIds: identitySpiffeAuth.allowedSpiffeIds,
            allowedAudiences: identitySpiffeAuth.allowedAudiences,
            configurationType: identitySpiffeAuth.trustBundleDistribution.profile,
            accessTokenTTL: identitySpiffeAuth.accessTokenTTL,
            accessTokenMaxTTL: identitySpiffeAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identitySpiffeAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identitySpiffeAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identitySpiffeAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/spiffe-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getSpiffeAuth",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Retrieve SPIFFE Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(SPIFFE_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identitySpiffeAuth: IdentitySpiffeAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identitySpiffeAuth = await server.services.identitySpiffeAuth.getSpiffeAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identitySpiffeAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_SPIFFE_AUTH,
          metadata: {
            identityId: identitySpiffeAuth.identityId
          }
        }
      });

      return { identitySpiffeAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/spiffe-auth/identities/:identityId/refresh-bundle",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "refreshSpiffeBundle",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Force-refresh the cached SPIFFE trust bundle for a remote-configured machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(SPIFFE_AUTH.REFRESH.identityId)
      }),
      response: {
        200: z.object({
          identitySpiffeAuth: IdentitySpiffeAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identitySpiffeAuth = await server.services.identitySpiffeAuth.refreshSpiffeBundle({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identitySpiffeAuth.orgId,
        event: {
          type: EventType.REFRESH_IDENTITY_SPIFFE_AUTH_BUNDLE,
          metadata: {
            identityId: identitySpiffeAuth.identityId
          }
        }
      });

      return { identitySpiffeAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/spiffe-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteSpiffeAuth",
      tags: [ApiDocsTags.SpiffeAuth],
      description: "Delete SPIFFE Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(SPIFFE_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identitySpiffeAuth: IdentitySpiffeAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identitySpiffeAuth = await server.services.identitySpiffeAuth.revokeSpiffeAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identitySpiffeAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_SPIFFE_AUTH,
          metadata: {
            identityId: identitySpiffeAuth.identityId
          }
        }
      });

      return { identitySpiffeAuth };
    }
  });
};
