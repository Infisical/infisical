import { z } from "zod";

import { IdentityKubernetesAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, KUBERNETES_AUTH } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const IdentityKubernetesAuthResponseSchema = IdentityKubernetesAuthsSchema.pick({
  id: true,
  accessTokenTTL: true,
  accessTokenMaxTTL: true,
  accessTokenNumUsesLimit: true,
  accessTokenTrustedIps: true,
  createdAt: true,
  updatedAt: true,
  tokenReviewMode: true,
  identityId: true,
  kubernetesHost: true,
  allowedNamespaces: true,
  allowedNames: true,
  allowedAudience: true,
  gatewayId: true
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
      operationId: "loginWithKubernetesAuth",
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Login with Kubernetes Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(KUBERNETES_AUTH.LOGIN.identityId),
        jwt: z.string().trim(),
        subOrganizationName: slugSchema().optional().describe(KUBERNETES_AUTH.LOGIN.subOrganizationName)
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
      const { identityKubernetesAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityKubernetesAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
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
      operationId: "attachKubernetesAuth",
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Attach Kubernetes Auth configuration onto machine identity",
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
          kubernetesHost: z
            .string()
            .trim()
            .min(1)
            .nullable()
            .describe(KUBERNETES_AUTH.ATTACH.kubernetesHost)
            .refine(
              (val) => {
                if (val === null) return true;

                return characterValidator([
                  CharacterType.Alphabets,
                  CharacterType.Numbers,
                  CharacterType.Colon,
                  CharacterType.Period,
                  CharacterType.ForwardSlash,
                  CharacterType.Hyphen
                ])(val);
              },
              {
                message:
                  "Kubernetes host must only contain alphabets, numbers, colons, periods, hyphen, and forward slashes."
              }
            ),
          caCert: z.string().trim().default("").describe(KUBERNETES_AUTH.ATTACH.caCert),
          tokenReviewerJwt: z.string().trim().optional().describe(KUBERNETES_AUTH.ATTACH.tokenReviewerJwt),
          tokenReviewMode: z
            .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
            .default(IdentityKubernetesAuthTokenReviewMode.Api)
            .describe(KUBERNETES_AUTH.ATTACH.tokenReviewMode),
          allowedNamespaces: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedNamespaces), // TODO: validation
          allowedNames: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedNames),
          allowedAudience: z.string().describe(KUBERNETES_AUTH.ATTACH.allowedAudience),
          gatewayId: z.string().uuid().optional().nullable().describe(KUBERNETES_AUTH.ATTACH.gatewayId),
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
        .superRefine((data, ctx) => {
          if (data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && !data.kubernetesHost) {
            ctx.addIssue({
              path: ["kubernetesHost"],
              code: z.ZodIssueCode.custom,
              message: "When token review mode is set to API, a Kubernetes host must be provided"
            });
          }
          if (data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway && !data.gatewayId) {
            ctx.addIssue({
              path: ["gatewayId"],
              code: z.ZodIssueCode.custom,
              message: "When token review mode is set to Gateway, a gateway must be selected"
            });
          }

          if (data.accessTokenTTL > data.accessTokenMaxTTL) {
            ctx.addIssue({
              path: ["accessTokenTTL"],
              code: z.ZodIssueCode.custom,
              message: "Access Token TTL cannot be greater than Access Token Max TTL."
            });
          }
        }),
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
            kubernetesHost: identityKubernetesAuth.kubernetesHost ?? "",
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
      operationId: "updateKubernetesAuth",
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Update Kubernetes Auth configuration on machine identity",
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
          kubernetesHost: z
            .string()
            .trim()
            .min(1)
            .nullable()
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.kubernetesHost)
            .refine(
              (val) => {
                if (!val) return true;

                return characterValidator([
                  CharacterType.Alphabets,
                  CharacterType.Numbers,
                  CharacterType.Colon,
                  CharacterType.Period,
                  CharacterType.ForwardSlash,
                  CharacterType.Hyphen
                ])(val);
              },
              {
                message:
                  "Kubernetes host must only contain alphabets, numbers, colons, periods, hyphen, and forward slashes."
              }
            ),
          caCert: z.string().trim().optional().describe(KUBERNETES_AUTH.UPDATE.caCert),
          tokenReviewerJwt: z.string().trim().nullable().optional().describe(KUBERNETES_AUTH.UPDATE.tokenReviewerJwt),
          tokenReviewMode: z
            .nativeEnum(IdentityKubernetesAuthTokenReviewMode)
            .optional()
            .describe(KUBERNETES_AUTH.UPDATE.tokenReviewMode),
          allowedNamespaces: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedNamespaces), // TODO: validation
          allowedNames: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedNames),
          allowedAudience: z.string().optional().describe(KUBERNETES_AUTH.UPDATE.allowedAudience),
          gatewayId: z.string().uuid().optional().nullable().describe(KUBERNETES_AUTH.UPDATE.gatewayId),
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
        .superRefine((data, ctx) => {
          if (
            data.tokenReviewMode &&
            data.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway &&
            !data.gatewayId
          ) {
            ctx.addIssue({
              path: ["gatewayId"],
              code: z.ZodIssueCode.custom,
              message: "When token review mode is set to Gateway, a gateway must be selected"
            });
          }
          if (data.accessTokenMaxTTL && data.accessTokenTTL ? data.accessTokenTTL > data.accessTokenMaxTTL : false) {
            ctx.addIssue({
              path: ["accessTokenTTL"],
              code: z.ZodIssueCode.custom,
              message: "Access Token TTL cannot be greater than Access Token Max TTL."
            });
          }
        }),
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
            kubernetesHost: identityKubernetesAuth.kubernetesHost ?? "",
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
      operationId: "getKubernetesAuth",
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Retrieve Kubernetes Auth configuration on machine identity",
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
      operationId: "deleteKubernetesAuth",
      tags: [ApiDocsTags.KubernetesAuth],
      description: "Delete Kubernetes Auth configuration on machine identity",
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
