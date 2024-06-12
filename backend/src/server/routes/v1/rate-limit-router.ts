import { z } from "zod";

import { RateLimitSchema } from "@app/db/schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifySuperAdmin } from "@app/server/plugins/auth/superAdmin";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerRateLimitRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          rateLimit: RateLimitSchema
        })
      }
    },
    handler: async () => {
      const rateLimit = await server.services.rateLimit.getRateLimits();
      return { rateLimit };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.API_KEY])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },

    schema: {
      body: RateLimitSchema.omit({
        id: true,
        createdAt: true,
        updatedAt: true
      }),
      response: {
        200: z.object({
          rateLimit: RateLimitSchema
        })
      }
    },
    handler: async (req) => {
      const rateLimit = await server.services.rateLimit.updateRateLimit(req.body);
      return { rateLimit };
    }
  });
};
