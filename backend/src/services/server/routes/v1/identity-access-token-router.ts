import { z } from "zod";

import { ApiDocsTags, UNIVERSAL_AUTH } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";

export const registerIdentityAccessTokenRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/token/renew",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "renewIdentityAccessToken",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Renew machine identity access token",
      body: z.object({
        accessToken: z.string().trim().describe(UNIVERSAL_AUTH.RENEW_ACCESS_TOKEN.accessToken)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      const { accessToken, identityAccessToken } = await server.services.identityAccessToken.renewAccessToken({
        accessToken: req.body.accessToken
      });
      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAccessToken.accessTokenTTL,
        accessTokenMaxTTL: identityAccessToken.accessTokenMaxTTL
      };
    }
  });

  server.route({
    url: "/token/revoke",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "revokeIdentityAccessToken",
      tags: [ApiDocsTags.UniversalAuth],
      description: "Revoke machine identity access token",
      body: z.object({
        accessToken: z.string().trim().describe(UNIVERSAL_AUTH.REVOKE_ACCESS_TOKEN.accessToken)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.identityAccessToken.revokeAccessToken(req.body.accessToken);
      return {
        message: "Successfully revoked access token"
      };
    }
  });
};
