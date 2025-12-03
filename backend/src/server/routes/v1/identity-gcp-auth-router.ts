import { z } from "zod";

import { IdentityGcpAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, GCP_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateGcpAuthField } from "@app/services/identity-gcp-auth/identity-gcp-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityGcpAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/gcp-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.GcpAuth],
      description: "Login with GCP Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(GCP_AUTH.LOGIN.identityId),
        jwt: z.string(),
        subOrganizationName: slugSchema().optional().describe(GCP_AUTH.LOGIN.subOrganizationName)
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
      const { identityGcpAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityGcpAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityGcpAuthId: identityGcpAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityGcpAuth.accessTokenTTL,
        accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.GcpAuth],
      description: "Attach GCP Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(GCP_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          type: z.enum(["iam", "gce"]),
          allowedServiceAccounts: validateGcpAuthField.describe(GCP_AUTH.ATTACH.allowedServiceAccounts),
          allowedProjects: validateGcpAuthField.describe(GCP_AUTH.ATTACH.allowedProjects),
          allowedZones: validateGcpAuthField.describe(GCP_AUTH.ATTACH.allowedZones),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(GCP_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(GCP_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(GCP_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(GCP_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.attachGcpAuth({
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
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            type: identityGcpAuth.type,
            allowedServiceAccounts: identityGcpAuth.allowedServiceAccounts,
            allowedProjects: identityGcpAuth.allowedProjects,
            allowedZones: identityGcpAuth.allowedZones,
            accessTokenTTL: identityGcpAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.GcpAuth],
      description: "Update GCP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(GCP_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          type: z.enum(["iam", "gce"]).optional(),
          allowedServiceAccounts: validateGcpAuthField.optional().describe(GCP_AUTH.UPDATE.allowedServiceAccounts),
          allowedProjects: validateGcpAuthField.optional().describe(GCP_AUTH.UPDATE.allowedProjects),
          allowedZones: validateGcpAuthField.optional().describe(GCP_AUTH.UPDATE.allowedZones),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(GCP_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(GCP_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).optional().describe(GCP_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(GCP_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.updateGcpAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId,
            type: identityGcpAuth.type,
            allowedServiceAccounts: identityGcpAuth.allowedServiceAccounts,
            allowedProjects: identityGcpAuth.allowedProjects,
            allowedZones: identityGcpAuth.allowedZones,
            accessTokenTTL: identityGcpAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.GcpAuth],
      description: "Retrieve GCP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(GCP_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.getGcpAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId
          }
        }
      });

      return { identityGcpAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/gcp-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.GcpAuth],
      description: "Delete GCP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(GCP_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityGcpAuth: IdentityGcpAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpAuth = await server.services.identityGcpAuth.revokeIdentityGcpAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_GCP_AUTH,
          metadata: {
            identityId: identityGcpAuth.identityId
          }
        }
      });

      return { identityGcpAuth };
    }
  });
};
