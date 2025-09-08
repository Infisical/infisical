import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
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
        name: z.string()
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
        name: z.string()
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
      throw new BadRequestError({
        message: "Org relay registration is not yet supported"
      });

      return server.services.relay.registerRelay({
        ...req.body,
        identityId: req.permission.id,
        orgId: req.permission.orgId
      });
    }
  });
};
