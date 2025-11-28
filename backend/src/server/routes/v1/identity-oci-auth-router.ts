import { z } from "zod";

import { IdentityOciAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, OCI_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { validateTenancy, validateUsernames } from "@app/services/identity-oci-auth/identity-oci-auth-validators";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityOciAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/oci-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OciAuth],
      description: "Login with OCI Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(OCI_AUTH.LOGIN.identityId),
        userOcid: z.string().trim().describe(OCI_AUTH.LOGIN.userOcid),
        headers: z
          .object({
            authorization: z.string(),
            host: z.string(),
            "x-date": z.string().optional(),
            date: z.string().optional()
          })
          .superRefine((val, ctx) => {
            if (!val.date && !val["x-date"]) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Either date or x-date must be provided",
                path: ["headers", "date"]
              });
            }
          })
          .describe(OCI_AUTH.LOGIN.headers),
        subOrganizationName: z.string().trim().optional().describe(OCI_AUTH.LOGIN.subOrganizationName)
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
      const { identityOciAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityOciAuth.login({
          ...req.body,
          subOrganizationName: req.body.subOrganizationName
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_OCI_AUTH,
          metadata: {
            identityId: identityOciAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityOciAuthId: identityOciAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityOciAuth.accessTokenTTL,
        accessTokenMaxTTL: identityOciAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/oci-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OciAuth],
      description: "Attach OCI Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(OCI_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          tenancyOcid: validateTenancy.describe(OCI_AUTH.ATTACH.tenancyOcid),
          allowedUsernames: validateUsernames.describe(OCI_AUTH.ATTACH.allowedUsernames),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(OCI_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(OCI_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(1)
            .max(315360000)
            .default(2592000)
            .describe(OCI_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(OCI_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityOciAuth: IdentityOciAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityOciAuth = await server.services.identityOciAuth.attachOciAuth({
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
        orgId: identityOciAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_OCI_AUTH,
          metadata: {
            identityId: identityOciAuth.identityId,
            tenancyOcid: identityOciAuth.tenancyOcid,
            allowedUsernames: identityOciAuth.allowedUsernames || null,
            accessTokenTTL: identityOciAuth.accessTokenTTL,
            accessTokenMaxTTL: identityOciAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityOciAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityOciAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityOciAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/oci-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OciAuth],
      description: "Update OCI Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(OCI_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          tenancyOcid: validateTenancy.describe(OCI_AUTH.UPDATE.tenancyOcid),
          allowedUsernames: validateUsernames.describe(OCI_AUTH.UPDATE.allowedUsernames),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(OCI_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(OCI_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z.number().int().min(0).optional().describe(OCI_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .min(0)
            .optional()
            .describe(OCI_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityOciAuth: IdentityOciAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityOciAuth = await server.services.identityOciAuth.updateOciAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId,
        allowedUsernames: req.body.allowedUsernames || null
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOciAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_OCI_AUTH,
          metadata: {
            identityId: identityOciAuth.identityId,
            tenancyOcid: identityOciAuth.tenancyOcid,
            allowedUsernames: identityOciAuth.allowedUsernames || null,
            accessTokenTTL: identityOciAuth.accessTokenTTL,
            accessTokenMaxTTL: identityOciAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityOciAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityOciAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityOciAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/oci-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OciAuth],
      description: "Retrieve OCI Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(OCI_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityOciAuth: IdentityOciAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityOciAuth = await server.services.identityOciAuth.getOciAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOciAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_OCI_AUTH,
          metadata: {
            identityId: identityOciAuth.identityId
          }
        }
      });
      return { identityOciAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/oci-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OciAuth],
      description: "Delete OCI Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(OCI_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityOciAuth: IdentityOciAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityOciAuth = await server.services.identityOciAuth.revokeIdentityOciAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityOciAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_OCI_AUTH,
          metadata: {
            identityId: identityOciAuth.identityId
          }
        }
      });

      return { identityOciAuth };
    }
  });
};
