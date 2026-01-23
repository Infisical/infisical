import z from "zod";

import { GatewaysV2Schema } from "@app/db/schemas/gateways-v2";
import { zodBuffer } from "@app/lib/zod";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGatewayV2Schema = GatewaysV2Schema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true
});

export const registerGatewayV2Router = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "registerGateway",
      body: z.object({
        relayName: slugSchema({ min: 1, max: 32, field: "relayName" }),
        name: slugSchema({ min: 1, max: 32, field: "name" })
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
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gateway = await server.services.gatewayV2.registerGateway({
        orgId: req.permission.orgId,
        relayName: req.body.relayName,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
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
      operationId: "gatewayHeartbeat",
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
      operationId: "listGateways",
      response: {
        200: SanitizedGatewayV2Schema.extend({
          identity: z.object({
            name: z.string(),
            id: z.string()
          })
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
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pamSessionKey = await server.services.gatewayV2.getPamSessionKey({
        orgPermission: req.permission
      });

      return pamSessionKey;
    }
  });
};
