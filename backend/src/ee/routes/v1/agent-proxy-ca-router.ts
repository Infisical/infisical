import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAgentProxyCaRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      response: {
        200: z.object({
          certificate: z.string(),
          keyAlgorithm: z.string(),
          issuedAt: z.date(),
          expiration: z.date(),
          serialNumber: z.string()
        })
      }
    },
    handler: async (req) => {
      return server.services.agentProxyCa.getRootCa(req.permission);
    }
  });

  server.route({
    method: "POST",
    url: "/sign",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      body: z.object({
        publicKey: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          certificate: z.string(),
          issuedAt: z.date(),
          expiration: z.date(),
          serialNumber: z.string()
        })
      }
    },
    handler: async (req) => {
      return server.services.agentProxyCa.signIntermediate(req.permission, req.body.publicKey);
    }
  });
};
