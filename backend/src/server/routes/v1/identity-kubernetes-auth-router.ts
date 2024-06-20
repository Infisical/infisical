import { z } from "zod";

import { IdentityKubernetesAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";

const IdentityKubernetesAuthResponseSchema = IdentityKubernetesAuthsSchema.omit({
  encryptedCaCert: true,
  caCertIV: true,
  caCertTag: true,
  encryptedTokenReviewerJwt: true,
  tokenReviewerJwtIV: true,
  tokenReviewerJwtTag: true
}).extend({
  caCert: z.string(),
  tokenReviewerJwt: z.string()
});

export const registerIdentityKubernetesRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/kubernetes-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with Kubernetes Auth",
      body: z.object({
        identityId: z.string().trim(),
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
      description: "Attach Kubernetes Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        kubernetesHost: z.string().trim().min(1),
        caCert: z.string().trim().default(""),
        tokenReviewerJwt: z.string().trim().min(1),
        allowedNamespaces: z.string(), // TODO: validation
        allowedNames: z.string(),
        allowedAudience: z.string(),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenMaxTTL: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0)
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
        identityId: req.params.identityId
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
      description: "Update Kubernetes Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
      }),
      body: z.object({
        kubernetesHost: z.string().trim().min(1).optional(),
        caCert: z.string().trim().optional(),
        tokenReviewerJwt: z.string().trim().min(1).optional(),
        allowedNamespaces: z.string().optional(), // TODO: validation
        allowedNames: z.string().optional(),
        allowedAudience: z.string().optional(),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .optional(),
        accessTokenTTL: z.number().int().min(0).optional(),
        accessTokenNumUsesLimit: z.number().int().min(0).optional(),
        accessTokenMaxTTL: z
          .number()
          .int()
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .optional()
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
      description: "Retrieve Kubernetes Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
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
};
