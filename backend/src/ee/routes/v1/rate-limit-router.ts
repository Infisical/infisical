import { z } from "zod";

import { RateLimitSchema } from "@app/db/schemas";
import { NotFoundError } from "@app/lib/errors";
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
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const rateLimit = await server.services.rateLimit.getRateLimits();
      if (!rateLimit) {
        throw new NotFoundError({
          name: "Get Rate Limit Error",
          message: "Rate limit configuration does not exist."
        });
      }
      return { rateLimit };
    }
  });

  server.route({
    method: "PUT",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },

    schema: {
      body: z.object({
        readRateLimit: z.number(),
        writeRateLimit: z.number(),
        secretsRateLimit: z.number(),
        authRateLimit: z.number(),
        inviteUserRateLimit: z.number(),
        mfaRateLimit: z.number(),
        publicEndpointLimit: z.number(),
        identityCreationLimit: z.number(),
        projectCreationLimit: z.number()
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
