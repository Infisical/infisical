import { z } from "zod";

import { IdentityAzureAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AZURE_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateAzureAuthField } from "@app/services/identity-azure-auth/identity-azure-auth-validators";

import {} from "../sanitizedSchemas";

export const registerIdentityAzureAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/azure-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with Azure Auth",
      body: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.LOGIN.identityId),
        jwt: z.string()
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
      const { identityAzureAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityAzureAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg.orgId,
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
      description: "Attach Azure Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.LOGIN.identityId)
      }),
      body: z.object({
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
          .min(1)
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000)
          .describe(AZURE_AUTH.ATTACH.accessTokenTTL),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000)
          .describe(AZURE_AUTH.ATTACH.accessTokenMaxTTL),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(AZURE_AUTH.ATTACH.accessTokenNumUsesLimit)
      }),
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
        identityId: req.params.identityId
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
      description: "Update Azure Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(AZURE_AUTH.UPDATE.identityId)
      }),
      body: z.object({
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
        accessTokenNumUsesLimit: z.number().int().min(0).optional().describe(AZURE_AUTH.UPDATE.accessTokenNumUsesLimit),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .optional()
          .describe(AZURE_AUTH.UPDATE.accessTokenMaxTTL)
      }),
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
      description: "Retrieve Azure Auth configuration on identity",
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
      description: "Delete Azure Auth configuration on identity",
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
