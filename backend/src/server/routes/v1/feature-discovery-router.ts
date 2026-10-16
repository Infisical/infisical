import { z } from "zod";

import { FEATURE_DISCOVERIES } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const FeatureDiscoverySchema = z.object({
  releaseId: z.string().describe(FEATURE_DISCOVERIES.releaseId),
  createdAt: z.date().describe(FEATURE_DISCOVERIES.createdAt)
});

export const registerFeatureDiscoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "listFeatureDiscoveries",
      description: "List the feature releases the current user has already discovered in the UI.",
      response: {
        200: z.object({
          featureDiscoveries: FeatureDiscoverySchema.array().describe(FEATURE_DISCOVERIES.featureDiscoveries)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }
      const featureDiscoveries = await server.services.featureDiscovery.listFeatureDiscoveries(req.auth.userId);
      return { featureDiscoveries };
    }
  });

  // Batch create: one picker view marks several releases at once, and repeats are ignored so retries are safe.
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "createFeatureDiscoveries",
      description: "Record that the current user has discovered one or more feature releases.",
      body: z.object({
        releaseIds: slugSchema({ max: 255, field: "Release ID" })
          .array()
          .min(1)
          .max(50)
          .describe(FEATURE_DISCOVERIES.releaseIds)
      }),
      response: {
        200: z.object({
          featureDiscoveries: FeatureDiscoverySchema.array().describe(FEATURE_DISCOVERIES.featureDiscoveries)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }
      const featureDiscoveries = await server.services.featureDiscovery.createFeatureDiscoveries(
        req.auth.userId,
        req.body.releaseIds
      );
      return { featureDiscoveries };
    }
  });
};
