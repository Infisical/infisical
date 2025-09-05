import z from "zod";

import { ConnectorsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedConnectorSchema = ConnectorsSchema.pick({
  id: true,
  identityId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  heartbeat: true
});

export const registerConnectorRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    schema: {
      body: z.object({
        relayName: z.string(),
        name: z.string()
      }),
      response: {
        200: z.object({
          connectorId: z.string(),
          relayIp: z.string(),
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
      const connector = await server.services.connector.registerConnector({
        orgId: req.permission.orgId,
        relayName: req.body.relayName,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        name: req.body.name
      });

      return connector;
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
      await server.services.connector.heartbeat({
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
        200: SanitizedConnectorSchema.extend({
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
      const connectors = await server.services.connector.listConnectors({
        orgPermission: req.permission
      });

      return connectors;
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
        200: SanitizedConnectorSchema
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.JWT]),
    handler: async (req) => {
      const connector = await server.services.connector.deleteConnectorById({
        orgPermission: req.permission,
        id: req.params.id
      });
      return connector;
    }
  });
};
