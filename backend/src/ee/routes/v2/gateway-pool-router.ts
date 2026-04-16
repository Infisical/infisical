import z from "zod";

import { GatewayPoolMembershipsSchema, GatewayPoolsSchema, GatewaysV2Schema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGatewayPoolSchema = GatewayPoolsSchema.pick({
  id: true,
  orgId: true,
  name: true,
  createdAt: true,
  updatedAt: true
});

const SanitizedPoolMemberSchema = GatewaysV2Schema.pick({
  id: true,
  name: true,
  heartbeat: true,
  lastHealthCheckStatus: true
});

export const registerGatewayPoolRouter = async (server: FastifyZodProvider) => {
  // Create a gateway pool
  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createGatewayPool",
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }).describe("Name for the gateway pool")
      }),
      response: {
        200: SanitizedGatewayPoolSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pool = await server.services.gatewayPool.createGatewayPool({
        name: req.body.name,
        ...req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_POOL_CREATE,
          metadata: {
            poolId: pool.id,
            name: pool.name
          }
        }
      });

      return pool;
    }
  });

  // List gateway pools
  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listGatewayPools",
      response: {
        200: z.array(
          SanitizedGatewayPoolSchema.extend({
            memberCount: z.number(),
            healthyMemberCount: z.number(),
            memberGatewayIds: z.array(z.string().uuid()),
            connectedResourcesCount: z.number()
          })
        )
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayPool.listGatewayPools(req.permission);
    }
  });

  // Get gateway pool by ID
  server.route({
    method: "GET",
    url: "/:poolId",
    schema: {
      operationId: "getGatewayPoolById",
      params: z.object({
        poolId: z.string().uuid()
      }),
      response: {
        200: SanitizedGatewayPoolSchema.extend({
          gateways: z.array(SanitizedPoolMemberSchema)
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayPool.getGatewayPoolById({
        poolId: req.params.poolId,
        ...req.permission
      });
    }
  });

  // Update gateway pool
  server.route({
    method: "PATCH",
    url: "/:poolId",
    schema: {
      operationId: "updateGatewayPool",
      params: z.object({
        poolId: z.string().uuid()
      }),
      body: z.object({
        name: slugSchema({ min: 1, max: 32, field: "name" }).optional().describe("New name for the pool")
      }),
      response: {
        200: SanitizedGatewayPoolSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pool = await server.services.gatewayPool.updateGatewayPool({
        poolId: req.params.poolId,
        name: req.body.name,
        ...req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_POOL_UPDATE,
          metadata: {
            poolId: pool.id,
            name: pool.name
          }
        }
      });

      return pool;
    }
  });

  // Delete gateway pool
  server.route({
    method: "DELETE",
    url: "/:poolId",
    schema: {
      operationId: "deleteGatewayPool",
      params: z.object({
        poolId: z.string().uuid()
      }),
      response: {
        200: SanitizedGatewayPoolSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pool = await server.services.gatewayPool.deleteGatewayPool({
        poolId: req.params.poolId,
        ...req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_POOL_DELETE,
          metadata: {
            poolId: pool.id,
            name: pool.name
          }
        }
      });

      return pool;
    }
  });

  // Add gateway to pool
  server.route({
    method: "POST",
    url: "/:poolId/memberships",
    schema: {
      operationId: "addGatewayToPool",
      params: z.object({
        poolId: z.string().uuid()
      }),
      body: z.object({
        gatewayId: z.string().uuid().describe("ID of the gateway to add to the pool")
      }),
      response: {
        200: GatewayPoolMembershipsSchema.pick({
          id: true,
          gatewayPoolId: true,
          gatewayId: true,
          createdAt: true
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.gatewayPool.addGatewayToPool({
        poolId: req.params.poolId,
        gatewayId: req.body.gatewayId,
        ...req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_POOL_ADD_MEMBER,
          metadata: {
            poolId: req.params.poolId,
            gatewayId: req.body.gatewayId
          }
        }
      });

      return membership;
    }
  });

  // Remove gateway from pool
  server.route({
    method: "DELETE",
    url: "/:poolId/memberships/:gatewayId",
    schema: {
      operationId: "removeGatewayFromPool",
      params: z.object({
        poolId: z.string().uuid(),
        gatewayId: z.string().uuid()
      }),
      response: {
        200: GatewayPoolMembershipsSchema.pick({
          id: true,
          gatewayPoolId: true,
          gatewayId: true,
          createdAt: true
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.gatewayPool.removeGatewayFromPool({
        poolId: req.params.poolId,
        gatewayId: req.params.gatewayId,
        ...req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GATEWAY_POOL_REMOVE_MEMBER,
          metadata: {
            poolId: req.params.poolId,
            gatewayId: req.params.gatewayId
          }
        }
      });

      return membership;
    }
  });

  // Get connected resources for a pool
  server.route({
    method: "GET",
    url: "/:poolId/resources",
    schema: {
      operationId: "getGatewayPoolConnectedResources",
      params: z.object({
        poolId: z.string().uuid()
      }),
      response: {
        200: z.object({
          kubernetesAuths: z.array(
            z.object({
              id: z.string(),
              identityId: z.string(),
              identityName: z.string().nullable()
            })
          )
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.gatewayPool.getConnectedResources({
        poolId: req.params.poolId,
        ...req.permission
      });
    }
  });
};
