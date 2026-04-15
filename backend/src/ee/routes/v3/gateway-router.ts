import z from "zod";

import { GatewaysV2Schema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const enrollRateLimit = { windowMs: 60 * 1000, max: 10 };

const SanitizedGatewayV2Schema = GatewaysV2Schema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true,
  lastHealthCheckStatus: true
});

export const registerGatewayV3Router = async (server: FastifyZodProvider) => {
  // Create a gateway
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createGateway",
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" })
      }),
      response: {
        200: SanitizedGatewayV2Schema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.createGateway({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_CREATE,
          metadata: {
            gatewayId: gateway.id,
            name: req.body.name
          }
        }
      });

      return gateway;
    }
  });

  // Generate enrollment token for a gateway
  server.route({
    method: "POST",
    url: "/:gatewayId/token-auth/configure",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "configureGatewayTokenAuth",
      params: z.object({
        gatewayId: z.string().uuid()
      }),
      response: {
        200: z.object({
          token: z.string(),
          expiresAt: z.date()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.gatewayV2.configureTokenAuth({
        orgPermission: req.permission,
        gatewayId: req.params.gatewayId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_ENROLLMENT_TOKEN_CREATE,
          metadata: {
            tokenId: result.id,
            name: result.name
          }
        }
      });

      return { token: result.token, expiresAt: result.expiresAt };
    }
  });

  // Enroll a gateway using a token (unauthenticated)
  server.route({
    method: "POST",
    url: "/token-auth/enroll",
    config: { rateLimit: enrollRateLimit },
    schema: {
      operationId: "enrollGatewayWithToken",
      body: z.object({
        token: z.string().min(1),
        relayName: slugSchema({ min: 1, max: 32, field: "relayName" }).optional()
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          gatewayId: z.string(),
          relayHost: z.string(),
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            clientCertificate: z.string(),
            clientPrivateKey: z.string(),
            serverCAPublicKey: z.string()
          })
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.gatewayV2.enrollGateway({
        token: req.body.token,
        relayName: req.body.relayName
      });

      await server.services.auditLog.createAuditLog({
        orgId: result.orgId,
        actor: {
          type: ActorType.GATEWAY,
          metadata: { gatewayId: result.gatewayId }
        },
        event: {
          type: EventType.GATEWAY_ENROLL,
          metadata: {
            gatewayId: result.gatewayId,
            name: result.gatewayName
          }
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] ?? "",
        userAgentType: UserAgentType.CLI
      });

      return result;
    }
  });

  // Connect (refresh certs) for an enrolled gateway
  server.route({
    method: "POST",
    url: "/connect",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "connectGateway",
      body: z.object({
        relayName: slugSchema({ min: 1, max: 32, field: "relayName" }).optional()
      }),
      response: {
        200: z.object({
          gatewayId: z.string(),
          relayHost: z.string(),
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            clientCertificate: z.string(),
            clientPrivateKey: z.string(),
            serverCAPublicKey: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayV2.connectGateway({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        relayName: req.body.relayName
      });
    }
  });
};
