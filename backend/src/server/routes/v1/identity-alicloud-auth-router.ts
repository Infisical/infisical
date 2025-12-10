import RE2 from "re2";
import { z } from "zod";

import { IdentityAlicloudAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ALICLOUD_AUTH, ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateArns } from "@app/services/identity-alicloud-auth/identity-alicloud-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityAliCloudAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/alicloud-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.AliCloudAuth],
      description: "Login with Alibaba Cloud Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(ALICLOUD_AUTH.LOGIN.identityId),
        Action: z.enum(["GetCallerIdentity"]).describe(ALICLOUD_AUTH.LOGIN.Action),
        Format: z.enum(["JSON"]).describe(ALICLOUD_AUTH.LOGIN.Format),
        Version: z
          .string()
          .refine((val) => new RE2("^\\d{4}-\\d{2}-\\d{2}$").test(val), {
            message: "Version must be in YYYY-MM-DD format"
          })
          .describe(ALICLOUD_AUTH.LOGIN.Version),
        AccessKeyId: z
          .string()
          .refine((val) => new RE2("^[A-Za-z0-9]+$").test(val), {
            message: "AccessKeyId must be alphanumeric"
          })
          .describe(ALICLOUD_AUTH.LOGIN.AccessKeyId),
        subOrganizationName: slugSchema().optional().describe(ALICLOUD_AUTH.LOGIN.subOrganizationName),
        SignatureMethod: z.enum(["HMAC-SHA1"]).describe(ALICLOUD_AUTH.LOGIN.SignatureMethod),
        Timestamp: z
          .string()
          .datetime({
            message: "Timestamp must be in YYYY-MM-DDTHH:mm:ssZ format"
          })
          .refine((val) => val.endsWith("Z"), {
            message: "Timestamp must be in YYYY-MM-DDTHH:mm:ssZ format"
          })
          .describe(ALICLOUD_AUTH.LOGIN.Timestamp),
        SignatureVersion: z.enum(["1.0"]).describe(ALICLOUD_AUTH.LOGIN.SignatureVersion),
        SignatureNonce: z
          .string()
          .refine((val) => new RE2("^[a-zA-Z0-9-_.]+$").test(val), {
            message:
              "SignatureNonce must be at least 1 character long and contain only URL-safe characters (alphanumeric, -, _, .)"
          })
          .describe(ALICLOUD_AUTH.LOGIN.SignatureNonce),
        Signature: z
          .string()
          .refine((val) => new RE2("^[A-Za-z0-9+/=]+$").test(val), {
            message: "Signature must be base64 characters"
          })
          .describe(ALICLOUD_AUTH.LOGIN.Signature)
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
      const { identityAliCloudAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityAliCloudAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_ALICLOUD_AUTH,
          metadata: {
            identityId: identityAliCloudAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityAliCloudAuthId: identityAliCloudAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAliCloudAuth.accessTokenTTL,
        accessTokenMaxTTL: identityAliCloudAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/alicloud-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AliCloudAuth],
      description: "Attach Alibaba Cloud Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(ALICLOUD_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          allowedArns: validateArns.describe(ALICLOUD_AUTH.ATTACH.allowedArns),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(ALICLOUD_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(ALICLOUD_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(1)
            .max(315360000)
            .default(2592000)
            .describe(ALICLOUD_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(ALICLOUD_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityAliCloudAuth: IdentityAlicloudAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAliCloudAuth = await server.services.identityAliCloudAuth.attachAliCloudAuth({
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
        orgId: identityAliCloudAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_ALICLOUD_AUTH,
          metadata: {
            identityId: identityAliCloudAuth.identityId,
            allowedArns: identityAliCloudAuth.allowedArns,
            accessTokenTTL: identityAliCloudAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAliCloudAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAliCloudAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAliCloudAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAliCloudAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/alicloud-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AliCloudAuth],
      description: "Update Alibaba Cloud Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(ALICLOUD_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          allowedArns: validateArns.describe(ALICLOUD_AUTH.UPDATE.allowedArns),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(ALICLOUD_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(ALICLOUD_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(ALICLOUD_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .min(0)
            .optional()
            .describe(ALICLOUD_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityAliCloudAuth: IdentityAlicloudAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAliCloudAuth = await server.services.identityAliCloudAuth.updateAliCloudAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId,
        allowedArns: req.body.allowedArns
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAliCloudAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_ALICLOUD_AUTH,
          metadata: {
            identityId: identityAliCloudAuth.identityId,
            allowedArns: identityAliCloudAuth.allowedArns,
            accessTokenTTL: identityAliCloudAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAliCloudAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAliCloudAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAliCloudAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAliCloudAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/alicloud-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AliCloudAuth],
      description: "Retrieve Alibaba Cloud Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(ALICLOUD_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityAliCloudAuth: IdentityAlicloudAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAliCloudAuth = await server.services.identityAliCloudAuth.getAliCloudAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAliCloudAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_ALICLOUD_AUTH,
          metadata: {
            identityId: identityAliCloudAuth.identityId
          }
        }
      });
      return { identityAliCloudAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/alicloud-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AliCloudAuth],
      description: "Delete Alibaba Cloud Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(ALICLOUD_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityAliCloudAuth: IdentityAlicloudAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAliCloudAuth = await server.services.identityAliCloudAuth.revokeIdentityAliCloudAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAliCloudAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_ALICLOUD_AUTH,
          metadata: {
            identityId: identityAliCloudAuth.identityId
          }
        }
      });

      return { identityAliCloudAuth };
    }
  });
};
