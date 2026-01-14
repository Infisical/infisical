import { z } from "zod";

import { IdentityJwtAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, JWT_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { JwtConfigurationType } from "@app/services/identity-jwt-auth/identity-jwt-auth-types";
import {
  validateJwtAuthAudiencesField,
  validateJwtBoundClaimsField
} from "@app/services/identity-jwt-auth/identity-jwt-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const IdentityJwtAuthResponseSchema = IdentityJwtAuthsSchema.omit({
  encryptedJwksCaCert: true,
  encryptedPublicKeys: true
}).extend({
  jwksCaCert: z.string(),
  publicKeys: z.string().array()
});

const CreateBaseSchema = z.object({
  boundIssuer: z.string().trim().default("").describe(JWT_AUTH.ATTACH.boundIssuer),
  boundAudiences: validateJwtAuthAudiencesField.describe(JWT_AUTH.ATTACH.boundAudiences),
  boundClaims: validateJwtBoundClaimsField.describe(JWT_AUTH.ATTACH.boundClaims),
  boundSubject: z.string().trim().default("").describe(JWT_AUTH.ATTACH.boundSubject),
  accessTokenTrustedIps: z
    .object({
      ipAddress: z.string().trim()
    })
    .array()
    .min(1)
    .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
    .describe(JWT_AUTH.ATTACH.accessTokenTrustedIps),
  accessTokenTTL: z.number().int().min(0).max(315360000).default(2592000).describe(JWT_AUTH.ATTACH.accessTokenTTL),
  accessTokenMaxTTL: z
    .number()
    .int()
    .min(0)
    .max(315360000)
    .default(2592000)
    .describe(JWT_AUTH.ATTACH.accessTokenMaxTTL),
  accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(JWT_AUTH.ATTACH.accessTokenNumUsesLimit)
});

const UpdateBaseSchema = z
  .object({
    boundIssuer: z.string().trim().default("").describe(JWT_AUTH.UPDATE.boundIssuer),
    boundAudiences: validateJwtAuthAudiencesField.describe(JWT_AUTH.UPDATE.boundAudiences),
    boundClaims: validateJwtBoundClaimsField.describe(JWT_AUTH.UPDATE.boundClaims),
    boundSubject: z.string().trim().default("").describe(JWT_AUTH.UPDATE.boundSubject),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
      .describe(JWT_AUTH.UPDATE.accessTokenTrustedIps),
    accessTokenTTL: z.number().int().min(0).max(315360000).default(2592000).describe(JWT_AUTH.UPDATE.accessTokenTTL),
    accessTokenMaxTTL: z
      .number()
      .int()
      .min(0)
      .max(315360000)
      .default(2592000)
      .describe(JWT_AUTH.UPDATE.accessTokenMaxTTL),
    accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(JWT_AUTH.UPDATE.accessTokenNumUsesLimit)
  })
  .partial();

const JwksConfigurationSchema = z.object({
  configurationType: z.literal(JwtConfigurationType.JWKS).describe(JWT_AUTH.ATTACH.configurationType),
  jwksUrl: z.string().trim().url().describe(JWT_AUTH.ATTACH.jwksUrl),
  jwksCaCert: z.string().trim().default("").describe(JWT_AUTH.ATTACH.jwksCaCert),
  publicKeys: z.string().array().optional().default([]).describe(JWT_AUTH.ATTACH.publicKeys)
});

const StaticConfigurationSchema = z.object({
  configurationType: z.literal(JwtConfigurationType.STATIC).describe(JWT_AUTH.ATTACH.configurationType),
  jwksUrl: z.string().trim().optional().default("").describe(JWT_AUTH.ATTACH.jwksUrl),
  jwksCaCert: z.string().trim().optional().default("").describe(JWT_AUTH.ATTACH.jwksCaCert),
  publicKeys: z.string().min(1).array().min(1).describe(JWT_AUTH.ATTACH.publicKeys)
});

export const registerIdentityJwtAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/jwt-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithJwtAuth",
      tags: [ApiDocsTags.JwtAuth],
      description: "Login with JWT Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(JWT_AUTH.LOGIN.identityId),
        jwt: z.string().trim(),
        subOrganizationName: slugSchema().optional().describe(JWT_AUTH.LOGIN.subOrganizationName)
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
      const { identityJwtAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityJwtAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_JWT_AUTH,
          metadata: {
            identityId: identityJwtAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityJwtAuthId: identityJwtAuth.id
          }
        }
      });
      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityJwtAuth.accessTokenTTL,
        accessTokenMaxTTL: identityJwtAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/jwt-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachJwtAuth",
      tags: [ApiDocsTags.JwtAuth],
      description: "Attach JWT Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(JWT_AUTH.ATTACH.identityId)
      }),
      body: z.discriminatedUnion("configurationType", [
        JwksConfigurationSchema.merge(CreateBaseSchema),
        StaticConfigurationSchema.merge(CreateBaseSchema)
      ]),
      response: {
        200: z.object({
          identityJwtAuth: IdentityJwtAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityJwtAuth = await server.services.identityJwtAuth.attachJwtAuth({
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
        orgId: identityJwtAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_JWT_AUTH,
          metadata: {
            identityId: identityJwtAuth.identityId,
            configurationType: identityJwtAuth.configurationType,
            jwksUrl: identityJwtAuth.jwksUrl,
            jwksCaCert: identityJwtAuth.jwksCaCert,
            publicKeys: identityJwtAuth.publicKeys,
            boundIssuer: identityJwtAuth.boundIssuer,
            boundAudiences: identityJwtAuth.boundAudiences,
            boundClaims: identityJwtAuth.boundClaims as Record<string, string>,
            boundSubject: identityJwtAuth.boundSubject,
            accessTokenTTL: identityJwtAuth.accessTokenTTL,
            accessTokenMaxTTL: identityJwtAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityJwtAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityJwtAuth.accessTokenNumUsesLimit
          }
        }
      });

      return {
        identityJwtAuth
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/jwt-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateJwtAuth",
      tags: [ApiDocsTags.JwtAuth],
      description: "Update JWT Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(JWT_AUTH.UPDATE.identityId)
      }),
      body: z.discriminatedUnion("configurationType", [
        JwksConfigurationSchema.merge(UpdateBaseSchema),
        StaticConfigurationSchema.merge(UpdateBaseSchema)
      ]),
      response: {
        200: z.object({
          identityJwtAuth: IdentityJwtAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityJwtAuth = await server.services.identityJwtAuth.updateJwtAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityJwtAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_JWT_AUTH,
          metadata: {
            identityId: identityJwtAuth.identityId,
            configurationType: identityJwtAuth.configurationType,
            jwksUrl: identityJwtAuth.jwksUrl,
            jwksCaCert: identityJwtAuth.jwksCaCert,
            publicKeys: identityJwtAuth.publicKeys,
            boundIssuer: identityJwtAuth.boundIssuer,
            boundAudiences: identityJwtAuth.boundAudiences,
            boundClaims: identityJwtAuth.boundClaims as Record<string, string>,
            boundSubject: identityJwtAuth.boundSubject,
            accessTokenTTL: identityJwtAuth.accessTokenTTL,
            accessTokenMaxTTL: identityJwtAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityJwtAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityJwtAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityJwtAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/jwt-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getJwtAuth",
      tags: [ApiDocsTags.JwtAuth],
      description: "Retrieve JWT Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(JWT_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityJwtAuth: IdentityJwtAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityJwtAuth = await server.services.identityJwtAuth.getJwtAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityJwtAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_JWT_AUTH,
          metadata: {
            identityId: identityJwtAuth.identityId
          }
        }
      });

      return { identityJwtAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/jwt-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteJwtAuth",
      tags: [ApiDocsTags.JwtAuth],
      description: "Delete JWT Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(JWT_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityJwtAuth: IdentityJwtAuthResponseSchema.omit({
            publicKeys: true,
            jwksCaCert: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityJwtAuth = await server.services.identityJwtAuth.revokeJwtAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityJwtAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_JWT_AUTH,
          metadata: {
            identityId: identityJwtAuth.identityId
          }
        }
      });

      return { identityJwtAuth };
    }
  });
};
