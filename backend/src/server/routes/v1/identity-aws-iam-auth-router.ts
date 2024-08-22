import { z } from "zod";

import { IdentityAwsAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AWS_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import {
  validateAccountIds,
  validatePrincipalArns
} from "@app/services/identity-aws-auth/identity-aws-auth-validators";

export const registerIdentityAwsAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/aws-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with AWS Auth",
      body: z.object({
        identityId: z.string().describe(AWS_AUTH.LOGIN.identityId),
        iamHttpRequestMethod: z.string().default("POST").describe(AWS_AUTH.LOGIN.iamHttpRequestMethod),
        iamRequestBody: z.string().describe(AWS_AUTH.LOGIN.iamRequestBody),
        iamRequestHeaders: z.string().describe(AWS_AUTH.LOGIN.iamRequestHeaders)
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
      const { identityAwsAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityAwsAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_AWS_AUTH,
          metadata: {
            identityId: identityAwsAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityAwsAuthId: identityAwsAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAwsAuth.accessTokenTTL,
        accessTokenMaxTTL: identityAwsAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/aws-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach AWS Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(AWS_AUTH.ATTACH.identityId)
      }),
      body: z.object({
        stsEndpoint: z
          .string()
          .trim()
          .min(1)
          .default("https://sts.amazonaws.com/")
          .describe(AWS_AUTH.ATTACH.stsEndpoint),
        allowedPrincipalArns: validatePrincipalArns.describe(AWS_AUTH.ATTACH.allowedPrincipalArns),
        allowedAccountIds: validateAccountIds.describe(AWS_AUTH.ATTACH.allowedAccountIds),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
          .describe(AWS_AUTH.ATTACH.accessTokenTrustedIps),
        accessTokenTTL: z
          .number()
          .int()
          .min(1)
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenTTL must have a non zero number"
          })
          .default(2592000)
          .describe(AWS_AUTH.ATTACH.accessTokenTTL),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .default(2592000)
          .describe(AWS_AUTH.ATTACH.accessTokenMaxTTL),
        accessTokenNumUsesLimit: z.number().int().min(0).default(0).describe(AWS_AUTH.ATTACH.accessTokenNumUsesLimit)
      }),
      response: {
        200: z.object({
          identityAwsAuth: IdentityAwsAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsAuth = await server.services.identityAwsAuth.attachAwsAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_AWS_AUTH,
          metadata: {
            identityId: identityAwsAuth.identityId,
            stsEndpoint: identityAwsAuth.stsEndpoint,
            allowedPrincipalArns: identityAwsAuth.allowedPrincipalArns,
            allowedAccountIds: identityAwsAuth.allowedAccountIds,
            accessTokenTTL: identityAwsAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAwsAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAwsAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAwsAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAwsAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/aws-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update AWS Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(AWS_AUTH.UPDATE.identityId)
      }),
      body: z.object({
        stsEndpoint: z.string().trim().min(1).optional().describe(AWS_AUTH.UPDATE.stsEndpoint),
        allowedPrincipalArns: validatePrincipalArns.describe(AWS_AUTH.UPDATE.allowedPrincipalArns),
        allowedAccountIds: validateAccountIds.describe(AWS_AUTH.UPDATE.allowedAccountIds),
        accessTokenTrustedIps: z
          .object({
            ipAddress: z.string().trim()
          })
          .array()
          .min(1)
          .optional()
          .describe(AWS_AUTH.UPDATE.accessTokenTrustedIps),
        accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(AWS_AUTH.UPDATE.accessTokenTTL),
        accessTokenNumUsesLimit: z.number().int().min(0).optional().describe(AWS_AUTH.UPDATE.accessTokenNumUsesLimit),
        accessTokenMaxTTL: z
          .number()
          .int()
          .max(315360000)
          .refine((value) => value !== 0, {
            message: "accessTokenMaxTTL must have a non zero number"
          })
          .optional()
          .describe(AWS_AUTH.UPDATE.accessTokenMaxTTL)
      }),
      response: {
        200: z.object({
          identityAwsAuth: IdentityAwsAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsAuth = await server.services.identityAwsAuth.updateAwsAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_AWS_AUTH,
          metadata: {
            identityId: identityAwsAuth.identityId,
            stsEndpoint: identityAwsAuth.stsEndpoint,
            allowedPrincipalArns: identityAwsAuth.allowedPrincipalArns,
            allowedAccountIds: identityAwsAuth.allowedAccountIds,
            accessTokenTTL: identityAwsAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAwsAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAwsAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAwsAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAwsAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/aws-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Retrieve AWS Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(AWS_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityAwsAuth: IdentityAwsAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsAuth = await server.services.identityAwsAuth.getAwsAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_AWS_AUTH,
          metadata: {
            identityId: identityAwsAuth.identityId
          }
        }
      });
      return { identityAwsAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/aws-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete AWS Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(AWS_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityAwsAuth: IdentityAwsAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsAuth = await server.services.identityAwsAuth.revokeIdentityAwsAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsAuth.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_AWS_AUTH,
          metadata: {
            identityId: identityAwsAuth.identityId
          }
        }
      });

      return { identityAwsAuth };
    }
  });
};
