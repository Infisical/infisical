import { z } from "zod";

import { IdentityAzureAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AZURE_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateAzureAuthField } from "@app/services/identity-azure-auth/identity-azure-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityAzureAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/azure-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.AzureAuth],
      description: "Login with Azure Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.LOGIN.identityId),
        jwt: z.string(),
        subOrganizationName: slugSchema().optional().describe(AZURE_AUTH.LOGIN.subOrganizationName)
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
      const { identityAzureAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityAzureAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_AZURE_AUTH,
          metadata: {
            identityId: identityAzureAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityAzureAuthId: identityAzureAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAzureAuth.accessTokenTTL,
        accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/azure-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AzureAuth],
      description: "Attach Azure Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.LOGIN.identityId)
      }),
      body: z
        .object({
          tenantId: z.string().trim().describe(AZURE_AUTH.ATTACH.tenantId),
          resource: z.string().trim().describe(AZURE_AUTH.ATTACH.resource),
          allowedServicePrincipalIds: validateAzureAuthField.describe(AZURE_AUTH.ATTACH.allowedServicePrincipalIds),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(AZURE_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(AZURE_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(AZURE_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(AZURE_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityAzureAuth: IdentityAzureAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAzureAuth = await server.services.identityAzureAuth.attachAzureAuth({
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
        orgId: identityAzureAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_AZURE_AUTH,
          metadata: {
            identityId: identityAzureAuth.identityId,
            tenantId: identityAzureAuth.tenantId,
            resource: identityAzureAuth.resource,
            accessTokenTTL: identityAzureAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAzureAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAzureAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAzureAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/azure-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AzureAuth],
      description: "Update Azure Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          tenantId: z.string().trim().optional().describe(AZURE_AUTH.UPDATE.tenantId),
          resource: z.string().trim().optional().describe(AZURE_AUTH.UPDATE.resource),
          allowedServicePrincipalIds: validateAzureAuthField
            .optional()
            .describe(AZURE_AUTH.UPDATE.allowedServicePrincipalIds),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(AZURE_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(AZURE_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(AZURE_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .min(0)
            .optional()
            .describe(AZURE_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityAzureAuth: IdentityAzureAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAzureAuth = await server.services.identityAzureAuth.updateAzureAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAzureAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_AZURE_AUTH,
          metadata: {
            identityId: identityAzureAuth.identityId,
            tenantId: identityAzureAuth.tenantId,
            resource: identityAzureAuth.resource,
            accessTokenTTL: identityAzureAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAzureAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAzureAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAzureAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/azure-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AzureAuth],
      description: "Retrieve Azure Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(AZURE_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityAzureAuth: IdentityAzureAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAzureAuth = await server.services.identityAzureAuth.getAzureAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAzureAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_AZURE_AUTH,
          metadata: {
            identityId: identityAzureAuth.identityId
          }
        }
      });

      return { identityAzureAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/azure-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AzureAuth],
      description: "Delete Azure Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(AZURE_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityAzureAuth: IdentityAzureAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAzureAuth = await server.services.identityAzureAuth.revokeIdentityAzureAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAzureAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_AZURE_AUTH,
          metadata: {
            identityId: identityAzureAuth.identityId
          }
        }
      });

      return { identityAzureAuth };
    }
  });
};
