import { z } from "zod";

import { ResourceAwsAuthsSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import {
  validateAccountIds,
  validatePrincipalArns
} from "@app/ee/services/resource-aws-auth/resource-aws-auth-validators";
import { ApiDocsTags, RESOURCE_AWS_AUTH } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const RESOURCE_TYPE = "gateway" as const;

export const registerResourceAwsAuthRouter = async (server: FastifyZodProvider) => {
  // Login (unauthenticated). Verifies the signed STS request and issues a GATEWAY_ACCESS_TOKEN.
  // Static route — Fastify resolves before the parametric "/gateways/:gatewayId" handler below,
  // so "login" never gets captured as a gatewayId.
  server.route({
    method: "POST",
    url: "/gateways/login",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "loginGatewayWithAwsAuth",
      tags: [ApiDocsTags.ResourceAwsAuth],
      description: "Login a gateway via AWS Auth",
      body: z.object({
        gatewayId: z.string().trim().describe(RESOURCE_AWS_AUTH.LOGIN.gatewayId),
        iamHttpRequestMethod: z.string().default("POST").describe(RESOURCE_AWS_AUTH.LOGIN.iamHttpRequestMethod),
        iamRequestBody: z.string().describe(RESOURCE_AWS_AUTH.LOGIN.iamRequestBody),
        iamRequestHeaders: z.string().describe(RESOURCE_AWS_AUTH.LOGIN.iamRequestHeaders)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      try {
        const result = await server.services.resourceAwsAuth.loginWithAwsAuth({
          resource: { type: RESOURCE_TYPE, id: req.body.gatewayId },
          iamHttpRequestMethod: req.body.iamHttpRequestMethod,
          iamRequestBody: req.body.iamRequestBody,
          iamRequestHeaders: req.body.iamRequestHeaders
        });

        await server.services.auditLog
          .createAuditLog({
            orgId: result.gateway.orgId,
            actor: {
              type: ActorType.GATEWAY,
              metadata: { gatewayId: result.gateway.id }
            },
            event: {
              type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
              metadata: {
                resourceType: RESOURCE_TYPE,
                resourceId: result.gateway.id,
                method: "aws",
                methodConfigId: result.config.id,
                principalArn: result.principalArn,
                accountId: result.accountId
              }
            },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] ?? "",
            userAgentType: UserAgentType.OTHER
          })
          .catch(() => {});

        void server.services.telemetry
          .sendPostHogEvents({
            event: PostHogEventTypes.ResourceAuthMethodLogin,
            distinctId: `gateway-${result.gateway.id}`,
            organizationId: result.gateway.orgId,
            properties: {
              resourceType: RESOURCE_TYPE,
              resourceId: result.gateway.id,
              orgId: result.gateway.orgId,
              method: "aws"
            }
          })
          .catch((err) => {
            logger.error(err, `Failed to send telemetry [gatewayId=${result.gateway.id}]`);
          });

        return {
          accessToken: result.accessToken,
          tokenType: "Bearer" as const
        };
      } catch (error) {
        if (error instanceof UnauthorizedError && error.detail?.gatewayId) {
          await server.services.auditLog
            .createAuditLog({
              orgId: error.detail.orgId as string,
              actor: {
                type: ActorType.GATEWAY,
                metadata: { gatewayId: error.detail.gatewayId as string }
              },
              event: {
                type: EventType.RESOURCE_AUTH_METHOD_LOGIN_FAILED,
                metadata: {
                  resourceType: RESOURCE_TYPE,
                  resourceId: error.detail.gatewayId as string,
                  method: "aws",
                  reasonCode: error.detail.reasonCode as string,
                  message: error.message,
                  principalArn: error.detail.principalArn as string | undefined,
                  accountId: error.detail.accountId as string | undefined
                }
              },
              ipAddress: req.ip,
              userAgent: req.headers["user-agent"] ?? "",
              userAgentType: UserAgentType.OTHER
            })
            .catch(() => {});
        }
        throw error;
      }
    }
  });

  // Attach
  server.route({
    method: "POST",
    url: "/gateways/:gatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "attachResourceAwsAuth",
      tags: [ApiDocsTags.ResourceAwsAuth],
      description: "Attach AWS auth method to a gateway",
      params: z.object({
        gatewayId: z.string().trim().describe(RESOURCE_AWS_AUTH.ATTACH.gatewayId)
      }),
      body: z
        .object({
          stsEndpoint: z
            .string()
            .trim()
            .min(1)
            .default("https://sts.amazonaws.com/")
            .describe(RESOURCE_AWS_AUTH.ATTACH.stsEndpoint),
          allowedPrincipalArns: validatePrincipalArns.describe(RESOURCE_AWS_AUTH.ATTACH.allowedPrincipalArns),
          allowedAccountIds: validateAccountIds.describe(RESOURCE_AWS_AUTH.ATTACH.allowedAccountIds)
        })
        .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
          message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
          path: ["allowedPrincipalArns"]
        }),
      response: {
        200: z.object({ resourceAwsAuth: ResourceAwsAuthsSchema })
      }
    },
    handler: async (req) => {
      const result = await server.services.resourceAwsAuth.attachAwsAuth({
        resource: { type: RESOURCE_TYPE, id: req.params.gatewayId },
        ...req.body,
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: result.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_ATTACH,
          metadata: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            method: "aws",
            methodConfigId: result.id,
            stsEndpoint: result.stsEndpoint,
            allowedPrincipalArns: result.allowedPrincipalArns,
            allowedAccountIds: result.allowedAccountIds,
            ...(result.unlinkedIdentityId ? { unlinkedIdentityId: result.unlinkedIdentityId } : {})
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodAttached,
          distinctId: getTelemetryDistinctId(req),
          organizationId: result.orgId,
          properties: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            orgId: result.orgId,
            method: "aws"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
        });

      return { resourceAwsAuth: result };
    }
  });

  // Update
  server.route({
    method: "PATCH",
    url: "/gateways/:gatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateResourceAwsAuth",
      tags: [ApiDocsTags.ResourceAwsAuth],
      description: "Update AWS auth on a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_AWS_AUTH.UPDATE.gatewayId) }),
      body: z
        .object({
          stsEndpoint: z.string().trim().min(1).optional().describe(RESOURCE_AWS_AUTH.UPDATE.stsEndpoint),
          allowedPrincipalArns: validatePrincipalArns.describe(RESOURCE_AWS_AUTH.UPDATE.allowedPrincipalArns),
          allowedAccountIds: validateAccountIds.describe(RESOURCE_AWS_AUTH.UPDATE.allowedAccountIds)
        })
        .refine((data) => data.allowedPrincipalArns.trim().length > 0 || data.allowedAccountIds.trim().length > 0, {
          message: "At least one of allowedPrincipalArns or allowedAccountIds must be set",
          path: ["allowedPrincipalArns"]
        }),
      response: { 200: z.object({ resourceAwsAuth: ResourceAwsAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceAwsAuth.updateAwsAuth({
        resource: { type: RESOURCE_TYPE, id: req.params.gatewayId },
        ...req.body,
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: result.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_UPDATE,
          metadata: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            method: "aws",
            methodConfigId: result.id,
            stsEndpoint: result.stsEndpoint,
            allowedPrincipalArns: result.allowedPrincipalArns,
            allowedAccountIds: result.allowedAccountIds
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: result.orgId,
          properties: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            orgId: result.orgId,
            method: "aws"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
        });

      return { resourceAwsAuth: result };
    }
  });

  // Get
  server.route({
    method: "GET",
    url: "/gateways/:gatewayId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getResourceAwsAuth",
      tags: [ApiDocsTags.ResourceAwsAuth],
      description: "Retrieve AWS auth on a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_AWS_AUTH.RETRIEVE.gatewayId) }),
      response: { 200: z.object({ resourceAwsAuth: ResourceAwsAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceAwsAuth.getAwsAuth({
        resource: { type: RESOURCE_TYPE, id: req.params.gatewayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: result.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_GET,
          metadata: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            method: "aws",
            methodConfigId: result.id
          }
        }
      });

      return { resourceAwsAuth: result };
    }
  });

  // Revoke
  server.route({
    method: "DELETE",
    url: "/gateways/:gatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "revokeResourceAwsAuth",
      tags: [ApiDocsTags.ResourceAwsAuth],
      description: "Revoke AWS auth on a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_AWS_AUTH.REVOKE.gatewayId) }),
      response: { 200: z.object({ resourceAwsAuth: ResourceAwsAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceAwsAuth.revokeAwsAuth({
        resource: { type: RESOURCE_TYPE, id: req.params.gatewayId },
        actor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: result.orgId,
        event: {
          type: EventType.RESOURCE_AUTH_METHOD_REVOKE,
          metadata: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            method: "aws",
            methodConfigId: result.id
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodRevoked,
          distinctId: getTelemetryDistinctId(req),
          organizationId: result.orgId,
          properties: {
            resourceType: RESOURCE_TYPE,
            resourceId: req.params.gatewayId,
            orgId: result.orgId,
            method: "aws"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
        });

      return { resourceAwsAuth: result };
    }
  });
};
