import { z } from "zod";

import { IdentityAwsIamAuthsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AWS_IAM_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import {
  validateAccountIds,
  validatePrincipalArns
} from "@app/services/identity-aws-iam-auth/identity-aws-iam-auth-validators";

export const registerIdentityAwsIamAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/aws-iam-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Login with Universal Auth",
      body: z.object({
        identityId: z.string().describe(AWS_IAM_AUTH.LOGIN.identityId),
        iamHttpRequestMethod: z.string().default("POST").describe(AWS_IAM_AUTH.LOGIN.iamHttpRequestMethod),
        iamRequestBody: z.string().describe(AWS_IAM_AUTH.LOGIN.iamRequestBody),
        iamRequestHeaders: z.string().describe(AWS_IAM_AUTH.LOGIN.iamRequestHeaders)
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
      const { identityAwsIamAuth, accessToken, identityAccessToken, identityMembershipOrg } =
        await server.services.identityAwsIamAuth.login(req.body);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_AWS_IAM_AUTH,
          metadata: {
            identityId: identityAwsIamAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityAwsIamAuthId: identityAwsIamAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAwsIamAuth.accessTokenTTL,
        accessTokenMaxTTL: identityAwsIamAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/aws-iam-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Attach AWS IAM Auth configuration onto identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
        stsEndpoint: z.string().trim().min(1).default("https://sts.amazonaws.com/"),
        allowedPrincipalArns: validatePrincipalArns,
        allowedAccountIds: validateAccountIds,
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
          identityAwsIamAuth: IdentityAwsIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsIamAuth = await server.services.identityAwsIamAuth.attachAwsIamAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsIamAuth.orgId,
        event: {
          type: EventType.ADD_IDENTITY_AWS_IAM_AUTH,
          metadata: {
            identityId: identityAwsIamAuth.identityId,
            stsEndpoint: identityAwsIamAuth.stsEndpoint,
            allowedPrincipalArns: identityAwsIamAuth.allowedPrincipalArns,
            allowedAccountIds: identityAwsIamAuth.allowedAccountIds,
            accessTokenTTL: identityAwsIamAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAwsIamAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAwsIamAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAwsIamAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAwsIamAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/aws-iam-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update AWS IAM Auth configuration on identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string()
      }),
      body: z.object({
        stsEndpoint: z.string().trim().min(1).optional(),
        allowedPrincipalArns: validatePrincipalArns,
        allowedAccountIds: validateAccountIds,
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
          identityAwsIamAuth: IdentityAwsIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsIamAuth = await server.services.identityAwsIamAuth.updateAwsIamAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsIamAuth.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_AWS_IAM_AUTH,
          metadata: {
            identityId: identityAwsIamAuth.identityId,
            stsEndpoint: identityAwsIamAuth.stsEndpoint,
            allowedPrincipalArns: identityAwsIamAuth.allowedPrincipalArns,
            allowedAccountIds: identityAwsIamAuth.allowedAccountIds,
            accessTokenTTL: identityAwsIamAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAwsIamAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityAwsIamAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityAwsIamAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityAwsIamAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/aws-iam-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Retrieve AWS IAM Auth configuration on identity",
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
          identityAwsIamAuth: IdentityAwsIamAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityAwsIamAuth = await server.services.identityAwsIamAuth.getAwsIamAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityAwsIamAuth.orgId,
        event: {
          type: EventType.GET_IDENTITY_AWS_IAM_AUTH,
          metadata: {
            identityId: identityAwsIamAuth.identityId
          }
        }
      });
      return { identityAwsIamAuth };
    }
  });
};
