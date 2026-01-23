import { z } from "zod";

import { GatewaysSchema } from "@app/db/schemas/gateways";
import { isValidIp } from "@app/lib/ip";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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

const isValidRelayAddress = (relayAddress: string) => {
  const [ip, port] = relayAddress.split(":");
  return isValidIp(ip) && Number(port) <= 65535 && Number(port) >= 40000;
};

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
          turnServerRealm: z.string(),
          turnServerAddress: z.string(),
          infisicalStaticIp: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const relayDetails = await server.services.gateway.getGatewayRelayDetails(
        req.permission.id,
        req.permission.orgId,
        req.permission.authMethod
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
        relayAddress: z.string().refine(isValidRelayAddress, { message: "Invalid relay address" })
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
        relayAddress: req.body.relayAddress,
        identityOrgAuthMethod: req.permission.authMethod
      });
      return gatewayCertificates;
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
      return { gateway };
    }
  });
};
