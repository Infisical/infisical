import z from "zod";

import { GatewayEnrollmentTokensSchema, GatewaysV2Schema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { zodBuffer } from "@app/lib/zod";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

// Stricter rate limit for the unauthenticated enroll endpoint
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

const SanitizedEnrollmentTokenSchema = GatewayEnrollmentTokensSchema.pick({
  id: true,
  name: true,
  ttl: true,
  expiresAt: true,
  usedAt: true,
  gatewayId: true,
  createdAt: true
});

export const registerGatewayV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "registerGateway",
      body: z.object({
        relayName: slugSchema({ min: 1, max: 32, field: "relayName" }).optional(),
        name: slugSchema({ min: 1, max: 32, field: "name" }).optional()
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
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayV2.registerGateway({
        orgId: req.permission.orgId,
        relayName: req.body.relayName,
        actorId: req.permission.id,
        actorType: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name
      });
    }
  });

  server.route({
    method: "POST",
    url: "/heartbeat",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "gatewayHeartbeat",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.gatewayV2.heartbeat({
        orgPermission: req.permission
      });

      return { message: "Successfully triggered heartbeat" };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listGateways",
      response: {
        200: SanitizedGatewayV2Schema.extend({
          identity: z.object({ name: z.string(), id: z.string() }).nullable(),
          connectedResourcesCount: z.number()
        }).array()
      }
    },
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gateways = await server.services.gatewayV2.listGateways({
        orgPermission: req.permission
      });

      return gateways;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteGateway",
      params: z.object({
        id: z.string()
      }),
      response: {
        200: SanitizedGatewayV2Schema
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.deleteGatewayById({
        orgPermission: req.permission,
        id: req.params.id
      });
      return gateway;
    }
  });

  server.route({
    method: "POST",
    url: "/:id/heartbeat",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "triggerGatewayHeartbeat",
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.gatewayV2.triggerHeartbeat({
        orgPermission: req.permission,
        id: req.params.id
      });

      return { message: "Successfully triggered heartbeat" };
    }
  });

  server.route({
    method: "GET",
    url: "/pam-session-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getGatewayPamSessionKey",
      response: {
        200: zodBuffer
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pamSessionKey = await server.services.gatewayV2.getPamSessionKey({
        orgPermission: req.permission
      });

      return pamSessionKey;
    }
  });

  server.route({
    method: "GET",
    url: "/:id/resources",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getGatewayConnectedResources",
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          appConnections: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              app: z.string(),
              projectId: z.string().nullish(),
              projectName: z.string().nullish()
            })
          ),
          dynamicSecrets: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              folderId: z.string(),
              projectId: z.string(),
              projectName: z.string(),
              environmentSlug: z.string()
            })
          ),
          pamResources: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              projectId: z.string(),
              projectName: z.string(),
              resourceType: z.string()
            })
          ),
          pamDiscoverySources: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              projectId: z.string(),
              projectName: z.string(),
              discoveryType: z.string()
            })
          ),
          kubernetesAuths: z.array(
            z.object({
              id: z.string(),
              identityId: z.string(),
              identityName: z.string()
            })
          ),
          mcpServers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              projectId: z.string(),
              projectName: z.string()
            })
          ),
          pkiDiscoveryConfigs: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              projectId: z.string(),
              projectName: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const resources = await server.services.gatewayV2.getConnectedResources({
        orgPermission: req.permission,
        gatewayId: req.params.id
      });

      return resources;
    }
  });

  // Enrollment token management
  server.route({
    method: "POST",
    url: "/enrollment-tokens",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createGatewayEnrollmentToken",
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }),
        ttlSeconds: z.number().int().min(60).max(86400).default(3600).optional()
      }),
      response: {
        200: SanitizedEnrollmentTokenSchema.extend({ token: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.gatewayV2.createEnrollmentToken({
        orgId: req.permission.orgId,
        actorId: req.permission.id,
        actorType: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name,
        ttlSeconds: req.body.ttlSeconds
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_ENROLLMENT_TOKEN_CREATE,
          metadata: {
            tokenId: result.id,
            name: req.body.name
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/enrollment-tokens",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listGatewayEnrollmentTokens",
      response: { 200: SanitizedEnrollmentTokenSchema.array() }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayV2.listEnrollmentTokens({ orgPermission: req.permission });
    }
  });

  server.route({
    method: "DELETE",
    url: "/enrollment-tokens/:tokenId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "deleteGatewayEnrollmentToken",
      params: z.object({ tokenId: z.string().uuid() }),
      response: { 200: z.object({ message: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name } = await server.services.gatewayV2.deleteEnrollmentToken({
        orgPermission: req.permission,
        tokenId: req.params.tokenId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_ENROLLMENT_TOKEN_DELETE,
          metadata: {
            tokenId: req.params.tokenId,
            name
          }
        }
      });

      return { message: "Enrollment token deleted" };
    }
  });

  server.route({
    method: "POST",
    url: "/re-enroll",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "reEnrollGateway",
      body: z.object({
        gatewayId: z.string().uuid().optional(),
        tokenId: z.string().uuid().optional()
      }),
      response: {
        200: SanitizedEnrollmentTokenSchema.extend({ token: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.gatewayV2.reEnrollGateway({
        orgPermission: req.permission,
        gatewayId: req.body.gatewayId,
        tokenId: req.body.tokenId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_RE_ENROLL,
          metadata: {
            gatewayId: req.body.gatewayId,
            tokenId: result.id,
            name: result.name
          }
        }
      });

      return result;
    }
  });

  // Enrollment endpoint — no standard auth; enrollment token in body is the credential
  server.route({
    method: "POST",
    url: "/enroll",
    config: { rateLimit: enrollRateLimit },
    schema: {
      operationId: "enrollGateway",
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
};
