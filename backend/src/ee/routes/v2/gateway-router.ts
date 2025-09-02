import z from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGatewayV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    schema: {
      body: z.object({
        proxyName: z.string(),
        name: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.registerGateway({
        orgId: req.permission.orgId,
        proxyName: req.body.proxyName,
        actorId: req.permission.id,
        name: req.body.name
      });

      return gateway;
    }
  });

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
      response: {
        200: z.any()
      }
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
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.deleteGatewayById({
        orgPermission: req.permission,
        id: req.params.id
      });
      return { gateway };
    }
  });
};
