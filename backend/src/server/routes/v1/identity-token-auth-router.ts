import { z } from "zod";

import { IdentityAccessTokensSchema } from "@app/db/schemas/identity-access-tokens";
import { IdentityTokenAuthsSchema } from "@app/db/schemas/identity-token-auths";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, TOKEN_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityTokenAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/token-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachTokenAuth",
      tags: [ApiDocsTags.TokenAuth],
      description: "Attach Token Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(TOKEN_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(TOKEN_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(TOKEN_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(TOKEN_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(TOKEN_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityTokenAuth: IdentityTokenAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTokenAuth = await server.services.identityTokenAuth.attachTokenAuth({
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
        orgId: identityTokenAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityTokenAuth.identityId,
            accessTokenTTL: identityTokenAuth.accessTokenTTL,
            accessTokenMaxTTL: identityTokenAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityTokenAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityTokenAuth.accessTokenNumUsesLimit
          }
        }
      });

      return {
        identityTokenAuth
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/token-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateTokenAuth",
      tags: [ApiDocsTags.TokenAuth],
      description: "Update Token Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(TOKEN_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(TOKEN_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(TOKEN_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(TOKEN_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(TOKEN_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityTokenAuth: IdentityTokenAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTokenAuth = await server.services.identityTokenAuth.updateTokenAuth({
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
        orgId: identityTokenAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityTokenAuth.identityId,
            accessTokenTTL: identityTokenAuth.accessTokenTTL,
            accessTokenMaxTTL: identityTokenAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityTokenAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityTokenAuth.accessTokenNumUsesLimit
          }
        }
      });

      return {
        identityTokenAuth
      };
    }
  });

  server.route({
    method: "GET",
    url: "/token-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getTokenAuth",
      tags: [ApiDocsTags.TokenAuth],
      description: "Retrieve Token Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TOKEN_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityTokenAuth: IdentityTokenAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTokenAuth = await server.services.identityTokenAuth.getTokenAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityTokenAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityTokenAuth.identityId
          }
        }
      });

      return { identityTokenAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/token-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteTokenAuth",
      tags: [ApiDocsTags.TokenAuth],
      description: "Delete Token Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TOKEN_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityTokenAuth: IdentityTokenAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTokenAuth = await server.services.identityTokenAuth.revokeIdentityTokenAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityTokenAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityTokenAuth.identityId
          }
        }
      });

      return { identityTokenAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/token-auth/identities/:identityId/tokens",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createTokenAuthToken",
      tags: [ApiDocsTags.TokenAuth],
      description: "Create token for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TOKEN_AUTH.CREATE_TOKEN.identityId)
      }),
      body: z.object({
        name: z.string().optional().describe(TOKEN_AUTH.CREATE_TOKEN.name),
        subOrganizationName: slugSchema().optional().describe(TOKEN_AUTH.CREATE_TOKEN.subOrganizationName)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer"),
          tokenData: IdentityAccessTokensSchema
        })
      }
    },
    handler: async (req) => {
      const { identityTokenAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityTokenAuth.createTokenAuthToken({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          identityId: req.params.identityId,
          isActorSuperAdmin: isSuperAdmin(req.auth),
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.CREATE_TOKEN_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityTokenAuth.identityId,
            identityAccessTokenId: identityAccessToken.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityTokenAuth.accessTokenTTL,
        accessTokenMaxTTL: identityTokenAuth.accessTokenMaxTTL,
        tokenData: identityAccessToken
      };
    }
  });

  server.route({
    method: "GET",
    url: "/token-auth/identities/:identityId/tokens",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getTokenAuthTokens",
      tags: [ApiDocsTags.TokenAuth],
      description: "Get tokens for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TOKEN_AUTH.GET_TOKENS.identityId)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(TOKEN_AUTH.GET_TOKENS.offset),
        limit: z.coerce.number().min(1).max(100).default(20).describe(TOKEN_AUTH.GET_TOKENS.limit)
      }),
      response: {
        200: z.object({
          tokens: IdentityAccessTokensSchema.array()
        })
      }
    },
    handler: async (req) => {
      const { tokens, identityMembershipOrg } = await server.services.identityTokenAuth.getTokenAuthTokens({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth),
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg.scopeOrgId,
        event: {
          type: EventType.GET_TOKENS_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: req.params.identityId
          }
        }
      });

      return { tokens };
    }
  });

  // deprecated - use the GET /token-auth/tokens/:tokenId instead, this endpoint will be removed in the future
  server.route({
    method: "GET",
    url: "/token-auth/identities/:identityId/tokens/:tokenId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: true,
      operationId: "getTokenAuthTokenByIdDeprecated",
      tags: [ApiDocsTags.TokenAuth],
      description: "Get token for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TOKEN_AUTH.GET_TOKEN.identityId),
        tokenId: z.string().describe(TOKEN_AUTH.GET_TOKEN.tokenId)
      }),
      response: {
        200: z.object({
          token: IdentityAccessTokensSchema
        })
      }
    },
    handler: async (req) => {
      const { token, identityMembershipOrg } = await server.services.identityTokenAuth.getTokenAuthTokenById({
        tokenId: req.params.tokenId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg.scopeOrgId,
        event: {
          type: EventType.GET_TOKEN_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: token.identityId,
            identityName: identityMembershipOrg.identity.name,
            tokenId: token.id
          }
        }
      });

      return { token };
    }
  });

  server.route({
    method: "GET",
    url: "/token-auth/tokens/:tokenId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getTokenAuthTokenById",
      tags: [ApiDocsTags.TokenAuth],
      description: "Get token for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        tokenId: z.string().describe(TOKEN_AUTH.GET_TOKEN.tokenId)
      }),
      response: {
        200: z.object({
          token: IdentityAccessTokensSchema
        })
      }
    },
    handler: async (req) => {
      const { token, identityMembershipOrg } = await server.services.identityTokenAuth.getTokenAuthTokenById({
        tokenId: req.params.tokenId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg.scopeOrgId,
        event: {
          type: EventType.GET_TOKEN_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: identityMembershipOrg.identity.id,
            identityName: identityMembershipOrg.identity.name,
            tokenId: token.id
          }
        }
      });

      return { token };
    }
  });

  server.route({
    method: "PATCH",
    url: "/token-auth/tokens/:tokenId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateTokenAuthToken",
      tags: [ApiDocsTags.TokenAuth],
      description: "Update token for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        tokenId: z.string().describe(TOKEN_AUTH.UPDATE_TOKEN.tokenId)
      }),
      body: z.object({
        name: z.string().optional().describe(TOKEN_AUTH.UPDATE_TOKEN.name)
      }),
      response: {
        200: z.object({
          token: IdentityAccessTokensSchema
        })
      }
    },
    handler: async (req) => {
      const { token, identityMembershipOrg } = await server.services.identityTokenAuth.updateTokenAuthToken({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        tokenId: req.params.tokenId,
        isActorSuperAdmin: isSuperAdmin(req.auth),
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg.scopeOrgId,
        event: {
          type: EventType.UPDATE_TOKEN_IDENTITY_TOKEN_AUTH,
          metadata: {
            identityId: token.identityId,
            tokenId: token.id,
            name: req.body.name
          }
        }
      });

      return { token };
    }
  });

  server.route({
    method: "POST",
    url: "/token-auth/tokens/:tokenId/revoke",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "revokeTokenAuthToken",
      tags: [ApiDocsTags.TokenAuth],
      description: "Revoke token for machine identity with Token Auth",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        tokenId: z.string().describe(TOKEN_AUTH.REVOKE_TOKEN.tokenId)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.identityTokenAuth.revokeTokenAuthToken({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        tokenId: req.params.tokenId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
      });

      return {
        message: "Successfully revoked access token"
      };
    }
  });
};
