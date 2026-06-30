import { z } from "zod";

import { GatewaysSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedGatewaySchema = GatewaysSchema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  issuedAt: true,
  serialNumber: true,
  heartbeat: true
});

export const registerGatewayRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/heartbeat",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.gateway.heartbeat({
        orgPermission: req.permission
      });
      return { message: "Successfully registered heartbeat" };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectId: z.string().optional()
      }),
      response: {
        200: z.object({
          gateways: SanitizedGatewaySchema.extend({
            identity: z.object({
              name: z.string(),
              id: z.string()
            })
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateways = await server.services.gateway.listGateways({
        orgPermission: req.permission
      });
      return { gateways };
    }
  });

  server.route({
    method: "GET",
    url: "/projects/:projectId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          gateways: SanitizedGatewaySchema.extend({
            identity: z.object({
              name: z.string(),
              id: z.string()
            })
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateways = await server.services.gateway.listGateways({
        orgPermission: req.permission
      });
      return { gateways };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          gateway: SanitizedGatewaySchema.extend({
            identity: z.object({
              name: z.string(),
              id: z.string()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateway = await server.services.gateway.getGatewayById({
        orgPermission: req.permission,
        id: req.params.id
      });
      return { gateway };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        name: slugSchema({ field: "name" }).optional()
      }),
      response: {
        200: z.object({
          gateway: SanitizedGatewaySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateway = await server.services.gateway.updateGatewayById({
        orgPermission: req.permission,
        id: req.params.id,
        name: req.body.name
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.GatewayUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            gatewayId: gateway.id
          }
        })
        .catch(() => {});

      return { gateway };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          gateway: SanitizedGatewaySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateway = await server.services.gateway.deleteGatewayById({
        orgPermission: req.permission,
        id: req.params.id
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.GatewayDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            gatewayId: gateway.id
          }
        })
        .catch(() => {});

      return { gateway };
    }
  });
};
