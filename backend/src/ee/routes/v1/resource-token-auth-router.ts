import { z } from "zod";

import { ResourceTokenAuthsSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, RESOURCE_TOKEN_AUTH } from "@app/lib/api-docs";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const RESOURCE_TYPE = "gateway" as const;

// Matches the v3 enroll route's rate limit. Unauthenticated, but the token itself is the
// credential — bounding attempts limits brute-force damage if someone tries to guess.
const loginRateLimit = { windowMs: 60 * 1000, max: 10 };

export const registerResourceTokenAuthRouter = async (server: FastifyZodProvider) => {
  // Login (unauthenticated). Consumes a one-time enrollment token and issues a GATEWAY_ACCESS_TOKEN.
  // Static route — Fastify resolves before the parametric "/gateways/:gatewayId" handler below,
  // so "login" never gets captured as a gatewayId.
  //
  // Mirrors POST /v1/resource-aws-auth/gateways/login (the AWS-auth credential exchange) and
  // matches the machine-identity convention (POST /v1/auth/<method>-auth/login).
  // Replaces the legacy POST /v3/gateways/token-auth/enroll, which is kept for deployed-CLI
  // compat and marked deprecated.
  server.route({
    method: "POST",
    url: "/gateways/login",
    config: { rateLimit: loginRateLimit },
    schema: {
      operationId: "loginGatewayWithTokenAuth",
      tags: [ApiDocsTags.ResourceTokenAuth],
      description: "Login a gateway via Token Auth using a previously-issued enrollment token",
      body: z.object({
        token: z.string().min(1).describe(RESOURCE_TOKEN_AUTH.LOGIN.token)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          gatewayId: z.string(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      // Failed logins (invalid / expired / used token) throw before we have any gateway
      // context, so we don't audit-log them at the gateway level here — the rate limit and
      // generic 4xx logging are the primary record. Successful logins emit RESOURCE_AUTH_METHOD_LOGIN.
      const result = await server.services.resourceTokenAuth.enrollWithToken({
        token: req.body.token
      });

      await server.services.auditLog
        .createAuditLog({
          orgId: result.orgId,
          actor: {
            type: ActorType.GATEWAY,
            metadata: { gatewayId: result.gatewayId }
          },
          event: {
            type: EventType.RESOURCE_AUTH_METHOD_LOGIN,
            metadata: {
              resourceType: RESOURCE_TYPE,
              resourceId: result.gatewayId,
              method: "token",
              methodConfigId: result.methodConfigId ?? "",
              enrollmentTokenId: result.enrollmentTokenId
            }
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] ?? "",
          userAgentType: UserAgentType.CLI
        })
        .catch(() => {});

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ResourceAuthMethodLogin,
          distinctId: `gateway-${result.gatewayId}`,
          organizationId: result.orgId,
          properties: {
            resourceType: RESOURCE_TYPE,
            resourceId: result.gatewayId,
            orgId: result.orgId,
            method: "token"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${result.gatewayId}]`);
        });

      return {
        accessToken: result.accessToken,
        gatewayId: result.gatewayId,
        tokenType: "Bearer" as const
      };
    }
  });

  // Attach
  server.route({
    method: "POST",
    url: "/gateways/:gatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "attachResourceTokenAuth",
      tags: [ApiDocsTags.ResourceTokenAuth],
      description: "Attach Token auth method to a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_TOKEN_AUTH.ATTACH.gatewayId) }),
      response: { 200: z.object({ resourceTokenAuth: ResourceTokenAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceTokenAuth.attachTokenAuth({
        resource: { type: RESOURCE_TYPE, id: req.params.gatewayId },
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
            method: "token",
            methodConfigId: result.id,
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
            method: "token"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
        });

      return { resourceTokenAuth: result };
    }
  });

  // Get
  server.route({
    method: "GET",
    url: "/gateways/:gatewayId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getResourceTokenAuth",
      tags: [ApiDocsTags.ResourceTokenAuth],
      description: "Retrieve Token auth on a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_TOKEN_AUTH.RETRIEVE.gatewayId) }),
      response: { 200: z.object({ resourceTokenAuth: ResourceTokenAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceTokenAuth.getTokenAuth({
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
            method: "token",
            methodConfigId: result.id
          }
        }
      });

      return { resourceTokenAuth: result };
    }
  });

  // Revoke
  server.route({
    method: "DELETE",
    url: "/gateways/:gatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "revokeResourceTokenAuth",
      tags: [ApiDocsTags.ResourceTokenAuth],
      description: "Revoke Token auth on a gateway",
      params: z.object({ gatewayId: z.string().trim().describe(RESOURCE_TOKEN_AUTH.REVOKE.gatewayId) }),
      response: { 200: z.object({ resourceTokenAuth: ResourceTokenAuthsSchema }) }
    },
    handler: async (req) => {
      const result = await server.services.resourceTokenAuth.revokeTokenAuth({
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
            method: "token",
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
            method: "token"
          }
        })
        .catch((err) => {
          logger.error(err, `Failed to send telemetry [gatewayId=${req.params.gatewayId}]`);
        });

      return { resourceTokenAuth: result };
    }
  });

  // Token generation lives on the legacy v3 endpoint (POST /v3/gateways/:id/token-auth/configure)
  // because the deployed CLI calls /v3/gateways/token-auth/enroll, and adding a parallel v1
  // endpoint just creates two URLs for the same operation. When v3 is deprecated, re-add a
  // v1 endpoint here as part of that migration.
};
