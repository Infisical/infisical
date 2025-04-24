import { z } from "zod";

import { IdentityKubernetesAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, KUBERNETES_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const IdentityKubernetesAuthResponseSchema = IdentityKubernetesAuthsSchema.pick({
  id: true,
  accessTokenTTL: true,
  accessTokenMaxTTL: true,
  accessTokenNumUsesLimit: true,
  accessTokenTrustedIps: true,
  createdAt: true,
  updatedAt: true,
  identityId: true,
  kubernetesHost: true,
  allowedNamespaces: true,
  allowedNames: true,
  allowedAudience: true
}).extend({
  caCert: z.string(),
  tokenReviewerJwt: z.string().optional().nullable()
});

export const registerIdentityKubernetesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/kubernetes-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Login with Kubernetes Auth",
      body: z.object({
        identityId: z.string().trim().describe(KUBERNETES_AUTH.LOGIN.identityId),
        jwt: z.string().trim()
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
      const { identityKubernetesAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityKubernetesAuth.login({
          identityId: req.body.identityId,
          jwt: req.body.jwt
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_KUBERNETES_AUTH,
          metadata: {
            identityId: identityKubernetesAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityKubernetesAuthId: identityKubernetesAuth.id
          }
        }
      });
      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityKubernetesAuth.accessTokenTTL,
        accessTokenMaxTTL: identityKubernetesAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/kubernetes-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Attach Kubernetes Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(KUBERNETES_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          kubernetesHost: z.string().trim().min(1).describe(KUBERNETES_AUTH.ATTACH.kubernetesHost),
          caCert: z.string().trim().default("").describe(KUBERNETES_AUTH.ATTACH.caCert),
          tokenReviewerJwt: z.string().trim().optional().describe(KUBERNETES_AUTH.ATTACH.tokenReviewerJwt),
          allowedNamespaces: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedNamespaces), // TODO: validation
          allowedNames: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedNames),
          allowedAudience: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedAudience),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(KUBERNETES_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(KUBERNETES_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(KUBERNETES_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(KUBERNETES_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityKubernetesAuth: IdentityKubernetesAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityKubernetesAuth = await server.services.identityKubernetesAuth.attachKubernetesAuth({
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
        orgId: identityKubernetesAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_KUBERNETES_AUTH,
          metadata: {
            identityId: identityKubernetesAuth.identityId,
            kubernetesHost: identityKubernetesAuth.kubernetesHost,
            allowedNamespaces: identityKubernetesAuth.allowedNamespaces,
            allowedNames: identityKubernetesAuth.allowedNames,
            accessTokenTTL: identityKubernetesAuth.accessTokenTTL,
            accessTokenMaxTTL: identityKubernetesAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityKubernetesAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityKubernetesAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityKubernetesAuth: IdentityKubernetesAuthResponseSchema.parse(identityKubernetesAuth) };
    }
  });

  server.route({
    method: "PATCH",
    url: "/kubernetes-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Update Kubernetes Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(KUBERNETES_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          kubernetesHost: z.string().trim().min(1).optional().describe(KUBERNETES_AUTH.UPDATE.kubernetesHost),
          caCert: z.string().trim().optional().describe(KUBERNETES_AUTH.UPDATE.caCert),
          tokenReviewerJwt: z.string().trim().nullable().optional().describe(KUBERNETES_AUTH.UPDATE.tokenReviewerJwt),
          allowedNamespaces: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedNamespaces), // TODO: validation
          allowedNames: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedNames),
          allowedAudience: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedAudience),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityKubernetesAuth: IdentityKubernetesAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityKubernetesAuth = await server.services.identityKubernetesAuth.updateKubernetesAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityKubernetesAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_KUBENETES_AUTH,
          metadata: {
            identityId: identityKubernetesAuth.identityId,
            kubernetesHost: identityKubernetesAuth.kubernetesHost,
            allowedNamespaces: identityKubernetesAuth.allowedNamespaces,
            allowedNames: identityKubernetesAuth.allowedNames,
            accessTokenTTL: identityKubernetesAuth.accessTokenTTL,
            accessTokenMaxTTL: identityKubernetesAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityKubernetesAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityKubernetesAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityKubernetesAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/kubernetes-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Retrieve Kubernetes Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(KUBERNETES_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityKubernetesAuth: IdentityKubernetesAuthResponseSchema
        })
      }
    },
    handler: async (req) => {
      const identityKubernetesAuth = await server.services.identityKubernetesAuth.getKubernetesAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityKubernetesAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_KUBERNETES_AUTH,
          metadata: {
            identityId: identityKubernetesAuth.identityId
          }
        }
      });

      return { identityKubernetesAuth: IdentityKubernetesAuthResponseSchema.parse(identityKubernetesAuth) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/kubernetes-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Delete Kubernetes Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(KUBERNETES_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityKubernetesAuth: IdentityKubernetesAuthResponseSchema.omit({
            caCert: true,
            tokenReviewerJwt: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityKubernetesAuth = await server.services.identityKubernetesAuth.revokeIdentityKubernetesAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityKubernetesAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_KUBERNETES_AUTH,
          metadata: {
            identityId: identityKubernetesAuth.identityId
          }
        }
      });

      return { identityKubernetesAuth };
    }
  });
};
