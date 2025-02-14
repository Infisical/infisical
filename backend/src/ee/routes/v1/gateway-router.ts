import { z } from "zod";

import { GatewaysSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedGatewaySchema = GatewaysSchema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  issuedAt: true,
  serialNumber: true
});

export const registerGatewayRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/register-identity",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          turnServerUsername: z.string(),
          turnServerPassword: z.string(),
          turnServerAddress: z.string(),
          infisicalStaticIp: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const relayDetails = await server.services.gateway.getGatewayRelayDetails(
        req.permission.id,
        req.permission.orgId
      );
      return relayDetails;
    }
  });

  server.route({
    method: "POST",
    url: "/exchange-cert",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        relayAddress: z.string()
      }),
      response: {
        200: z.object({
          serialNumber: z.string(),
          privateKey: z.string(),
          certificate: z.string(),
          certificateChain: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const gatewayCertificates = await server.services.gateway.exchangeAllocatedRelayAddress({
        identityOrg: req.permission.orgId,
        identityId: req.permission.id,
        relayAddress: req.body.relayAddress
      });
      return gatewayCertificates;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
    method: "DELETE",
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
      return { gateway };
    }
  });
};
