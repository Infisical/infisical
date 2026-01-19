import { z } from "zod";

import { IdentityUaClientSecretsSchema, IdentityUniversalAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, UNIVERSAL_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const sanitizedClientSecretSchema = IdentityUaClientSecretsSchema.pick({
  id: true,
  createdAt: true,
  updatedAt: true,
  description: true,
  clientSecretPrefix: true,
  clientSecretNumUses: true,
  clientSecretNumUsesLimit: true,
  clientSecretTTL: true,
  identityUAId: true,
  isClientSecretRevoked: true
});

export const registerIdentityUaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/universal-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithUniversalAuth",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Login with Universal Auth for machine identity",
      body: z.object({
        clientId: z.string().trim().describe(UNIVERSAL_AUTH.LOGIN.clientId),
        clientSecret: z.string().trim().describe(UNIVERSAL_AUTH.LOGIN.clientSecret),
        subOrganizationName: slugSchema().optional().describe(UNIVERSAL_AUTH.LOGIN.subOrganizationName)
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
      const {
        identityUa,
        accessToken,
        identityAccessToken,
        validClientSecretInfo,
        identity,
        accessTokenTTL,
        accessTokenMaxTTL
      } = await server.services.identityUa.login({
        ...req.body,
        ip: req.realIp
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH,
          metadata: {
            clientSecretId: validClientSecretInfo.id,
            identityId: identityUa.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityUniversalAuthId: identityUa.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: accessTokenTTL,
        accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/universal-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachUniversalAuth",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Attach Universal Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(UNIVERSAL_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          clientSecretTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(UNIVERSAL_AUTH.ATTACH.clientSecretTrustedIps),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(UNIVERSAL_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(UNIVERSAL_AUTH.ATTACH.accessTokenTTL), // 30 days
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(UNIVERSAL_AUTH.ATTACH.accessTokenMaxTTL), // 30 days
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(UNIVERSAL_AUTH.ATTACH.accessTokenNumUsesLimit),
          accessTokenPeriod: z.number().int().min(0).default(0).describe(UNIVERSAL_AUTH.ATTACH.accessTokenPeriod),
          lockoutEnabled: z.boolean().default(true).describe(UNIVERSAL_AUTH.ATTACH.lockoutEnabled),
          lockoutThreshold: z.number().min(1).max(30).default(3).describe(UNIVERSAL_AUTH.ATTACH.lockoutThreshold),
          lockoutDurationSeconds: z
            .number()
            .min(30)
            .max(86400)
            .default(300)
            .describe(UNIVERSAL_AUTH.ATTACH.lockoutDurationSeconds),
          lockoutCounterResetSeconds: z
            .number()
            .min(5)
            .max(3600)
            .default(30)
            .describe(UNIVERSAL_AUTH.ATTACH.lockoutCounterResetSeconds)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityUniversalAuth: IdentityUniversalAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityUniversalAuth = await server.services.identityUa.attachUniversalAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityUniversalAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_UNIVERSAL_AUTH,
          metadata: {
            identityId: identityUniversalAuth.identityId,
            accessTokenTTL: identityUniversalAuth.accessTokenTTL,
            accessTokenMaxTTL: identityUniversalAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityUniversalAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            clientSecretTrustedIps: identityUniversalAuth.clientSecretTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityUniversalAuth.accessTokenNumUsesLimit,
            lockoutEnabled: identityUniversalAuth.lockoutEnabled,
            lockoutThreshold: identityUniversalAuth.lockoutThreshold,
            lockoutDurationSeconds: identityUniversalAuth.lockoutDurationSeconds,
            lockoutCounterResetSeconds: identityUniversalAuth.lockoutCounterResetSeconds
          }
        }
      });

      return { identityUniversalAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/universal-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateUniversalAuth",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Update Universal Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          clientSecretTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.clientSecretTrustedIps),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.accessTokenMaxTTL),
          accessTokenPeriod: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.accessTokenPeriod),
          lockoutEnabled: z.boolean().optional().describe(UNIVERSAL_AUTH.UPDATE.lockoutEnabled),
          lockoutThreshold: z.number().min(1).max(30).optional().describe(UNIVERSAL_AUTH.UPDATE.lockoutThreshold),
          lockoutDurationSeconds: z
            .number()
            .min(30)
            .max(86400)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.lockoutDurationSeconds),
          lockoutCounterResetSeconds: z
            .number()
            .min(5)
            .max(3600)
            .optional()
            .describe(UNIVERSAL_AUTH.UPDATE.lockoutCounterResetSeconds)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityUniversalAuth: IdentityUniversalAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityUniversalAuth = await server.services.identityUa.updateUniversalAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityUniversalAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH,
          metadata: {
            identityId: identityUniversalAuth.identityId,
            accessTokenTTL: identityUniversalAuth.accessTokenTTL,
            accessTokenMaxTTL: identityUniversalAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityUniversalAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            clientSecretTrustedIps: identityUniversalAuth.clientSecretTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityUniversalAuth.accessTokenNumUsesLimit,
            lockoutEnabled: identityUniversalAuth.lockoutEnabled,
            lockoutThreshold: identityUniversalAuth.lockoutThreshold,
            lockoutDurationSeconds: identityUniversalAuth.lockoutDurationSeconds,
            lockoutCounterResetSeconds: identityUniversalAuth.lockoutCounterResetSeconds
          }
        }
      });

      return { identityUniversalAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/universal-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getUniversalAuth",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Retrieve Universal Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityUniversalAuth: IdentityUniversalAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityUniversalAuth = await server.services.identityUa.getIdentityUniversalAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityUniversalAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_UNIVERSAL_AUTH,
          metadata: {
            identityId: identityUniversalAuth.identityId
          }
        }
      });

      return { identityUniversalAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/universal-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteUniversalAuth",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Delete Universal Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityUniversalAuth: IdentityUniversalAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityUniversalAuth = await server.services.identityUa.revokeIdentityUniversalAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityUniversalAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH,
          metadata: {
            identityId: identityUniversalAuth.identityId
          }
        }
      });

      return { identityUniversalAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/universal-auth/identities/:identityId/client-secrets",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createUniversalAuthClientSecret",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Create Universal Auth Client Secret for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.CREATE_CLIENT_SECRET.identityId)
      }),
      body: z.object({
        description: z.string().trim().default("").describe(UNIVERSAL_AUTH.CREATE_CLIENT_SECRET.description),
        numUsesLimit: z.number().min(0).default(0).describe(UNIVERSAL_AUTH.CREATE_CLIENT_SECRET.numUsesLimit),
        ttl: z.number().min(0).max(315360000).default(0).describe(UNIVERSAL_AUTH.CREATE_CLIENT_SECRET.ttl)
      }),
      response: {
        200: z.object({
          clientSecret: z.string(),
          clientSecretData: sanitizedClientSecretSchema
        })
      }
    },
    handler: async (req) => {
      const { clientSecret, clientSecretData, orgId } =
        await server.services.identityUa.createUniversalAuthClientSecret({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          identityId: req.params.identityId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId,
        event: {
          type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET,
          metadata: {
            identityId: req.params.identityId,
            clientSecretId: clientSecretData.id
          }
        }
      });

      return { clientSecret, clientSecretData };
    }
  });

  server.route({
    method: "GET",
    url: "/universal-auth/identities/:identityId/client-secrets",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listUniversalAuthClientSecrets",
      tags: [ApiDocsTags.UniversalAuth],
      description: "List Universal Auth Client Secrets for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.LIST_CLIENT_SECRETS.identityId)
      }),
      response: {
        200: z.object({
          clientSecretData: sanitizedClientSecretSchema.array()
        })
      }
    },
    handler: async (req) => {
      const { clientSecrets: clientSecretData, orgId } = await server.services.identityUa.getUniversalAuthClientSecrets(
        {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          identityId: req.params.identityId
        }
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId,
        event: {
          type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS,
          metadata: {
            identityId: req.params.identityId
          }
        }
      });
      return { clientSecretData };
    }
  });

  server.route({
    method: "GET",
    url: "/universal-auth/identities/:identityId/client-secrets/:clientSecretId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getUniversalAuthClientSecret",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Get Universal Auth Client Secret for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.GET_CLIENT_SECRET.identityId),
        clientSecretId: z.string().describe(UNIVERSAL_AUTH.GET_CLIENT_SECRET.clientSecretId)
      }),
      response: {
        200: z.object({
          clientSecretData: sanitizedClientSecretSchema
        })
      }
    },
    handler: async (req) => {
      const clientSecretData = await server.services.identityUa.getUniversalAuthClientSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        clientSecretId: req.params.clientSecretId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: clientSecretData.orgId,
        event: {
          type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET_BY_ID,
          metadata: {
            identityId: clientSecretData.identityId,
            clientSecretId: clientSecretData.id
          }
        }
      });

      return { clientSecretData };
    }
  });

  server.route({
    method: "POST",
    url: "/universal-auth/identities/:identityId/client-secrets/:clientSecretId/revoke",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "revokeUniversalAuthClientSecret",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Revoke Universal Auth Client Secrets for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.REVOKE_CLIENT_SECRET.identityId),
        clientSecretId: z.string().describe(UNIVERSAL_AUTH.REVOKE_CLIENT_SECRET.clientSecretId)
      }),
      response: {
        200: z.object({
          clientSecretData: sanitizedClientSecretSchema
        })
      }
    },
    handler: async (req) => {
      const clientSecretData = await server.services.identityUa.revokeUniversalAuthClientSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        clientSecretId: req.params.clientSecretId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: clientSecretData.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET,
          metadata: {
            identityId: clientSecretData.identityId,
            clientSecretId: clientSecretData.id
          }
        }
      });

      return { clientSecretData };
    }
  });

  server.route({
    method: "POST",
    url: "/universal-auth/identities/:identityId/clear-lockouts",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "clearUniversalAuthLockouts",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Clear Universal Auth Lockouts for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(UNIVERSAL_AUTH.CLEAR_CLIENT_LOCKOUTS.identityId)
      }),
      response: {
        200: z.object({
          deleted: z.number()
        })
      }
    },
    handler: async (req) => {
      const clearLockoutsData = await server.services.identityUa.clearUniversalAuthLockouts({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: clearLockoutsData.orgId,
        event: {
          type: EventType.CLEAR_IDENTITY_UNIVERSAL_AUTH_LOCKOUTS,
          metadata: {
            identityId: clearLockoutsData.identityId
          }
        }
      });

      return clearLockoutsData;
    }
  });
};
