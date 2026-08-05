import { z } from "zod";

import { SecretsUsageInsightsSchema } from "@app/ee/services/product-insights/product-insights-schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProductInsightsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/secrets/usage-insights",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getSecretsUsageInsights",
      description: "Get secrets management usage counts for the requesting organization.",
      response: {
        200: z.object({
          usageInsights: SecretsUsageInsightsSchema
        })
      }
    },
    handler: async (req) => {
      const usageInsights = await server.services.productInsights.getSecretsUsageInsights({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      return { usageInsights };
    }
  });
};
