import { z } from "zod";

import { IdentityGcpIamAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";

export const registerIdentityGcpIamAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/gcp-iam-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with GCP IAM Auth",
      body: z.object({
        identityId: z.string(),
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
      const { identityGcpIamAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityGcpIamAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_GCP_IAM_AUTH,
          metadata: {
            identityId: identityGcpIamAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityGcpIamAuthId: identityGcpIamAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityGcpIamAuth.accessTokenTTL,
        accessTokenMaxTTL: identityGcpIamAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/gcp-iam-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach GCP IAM Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        allowedServiceAccounts: z.string(), // TODO: better validation
        allowedProjects: z.string(), // TODO: better validation
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
          identityGcpIamAuth: IdentityGcpIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpIamAuth = await server.services.identityGcpIamAuth.attachGcpIamAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpIamAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_GCP_IAM_AUTH,
          metadata: {
            identityId: identityGcpIamAuth.identityId,
            allowedServiceAccounts: identityGcpIamAuth.allowedServiceAccounts,
            allowedProjects: identityGcpIamAuth.allowedProjects,
            accessTokenTTL: identityGcpIamAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpIamAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpIamAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpIamAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpIamAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/gcp-iam-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update GCP IAM Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        allowedServiceAccounts: z.string().trim().optional(),
        allowedProjects: z.string().trim().optional(),
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
          identityGcpIamAuth: IdentityGcpIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpIamAuth = await server.services.identityGcpIamAuth.updateGcpIamAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpIamAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_GCP_IAM_AUTH,
          metadata: {
            identityId: identityGcpIamAuth.identityId,
            allowedServiceAccounts: identityGcpIamAuth.allowedServiceAccounts,
            allowedProjects: identityGcpIamAuth.allowedProjects,
            accessTokenTTL: identityGcpIamAuth.accessTokenTTL,
            accessTokenMaxTTL: identityGcpIamAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityGcpIamAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityGcpIamAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityGcpIamAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/gcp-iam-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Retrieve GCP IAM Auth configuration on identity",
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
          identityGcpIamAuth: IdentityGcpIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityGcpIamAuth = await server.services.identityGcpIamAuth.getGcpIamAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityGcpIamAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_GCP_IAM_AUTH,
          metadata: {
            identityId: identityGcpIamAuth.identityId
          }
        }
      });

      return { identityGcpIamAuth };
    }
  });
};
