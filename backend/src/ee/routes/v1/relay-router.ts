import { z } from "zod";

import { RelaysSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerRelayRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  server.route({
    method: "POST",
    url: "/register-instance-relay",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        host: z.string(),
        name: slugSchema({ min: 1, max: 32, field: "name" })
      }),
      response: {
        200: z.object({
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCAPublicKey: z.string()
          })
        })
      }
    },
    onRequest: (req, _, next) => {
      const authHeader = req.headers.authorization;

      if (appCfg.RELAY_AUTH_SECRET && authHeader) {
        const expectedHeader = `Bearer ${appCfg.RELAY_AUTH_SECRET}`;
        if (
          authHeader.length === expectedHeader.length &&
          crypto.nativeCrypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader))
        ) {
          return next();
        }
      }

      throw new UnauthorizedError({
        message: "Invalid relay auth secret"
      });
    },
    handler: async (req) => {
      return server.services.relay.registerRelay({
        ...req.body
      });
    }
  });

  server.route({
    method: "POST",
    url: "/register-org-relay",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        host: z.string(),
        name: slugSchema({ min: 1, max: 32, field: "name" })
      }),
      response: {
        200: z.object({
          pki: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCertificateChain: z.string()
          }),
          ssh: z.object({
            serverCertificate: z.string(),
            serverPrivateKey: z.string(),
            clientCAPublicKey: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.relay.registerRelay({
        ...req.body,
        identityId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "GET",
    url: "/",
    schema: {
      response: {
        200: RelaysSchema.array()
      }
    },
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.relay.getRelays({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
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
        200: RelaysSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.relay.deleteRelay({
        id: req.params.id,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
    }
  });
};
