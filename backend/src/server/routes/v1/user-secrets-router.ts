import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({
          secrets: z
            .array(
              z.object({
                title: z.string(),
                fields: z.record(z.string(), z.string())
              })
            )
            .or(z.undefined())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { orgId } = req.permission;
      const secrets = await server.services.userSecrets.getSecrets(orgId);
      return {
        secrets
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({}),
      body: z.object({
        credentialType: z.string(),
        title: z.string().min(1),
        fields: z.record(z.string(), z.string())
      }),
      response: {
        200: z.boolean()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      try {
        const { orgId } = req.permission;
        await server.services.userSecrets.createSecrets({ orgId, ...req.body });
        return true;
      } catch (error) {
        server.log.error(error);
        return false;
      }
    }
  });
};
