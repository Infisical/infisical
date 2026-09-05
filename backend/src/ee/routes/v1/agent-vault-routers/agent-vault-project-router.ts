import z from "zod";

import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAgentVaultProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      // Internal endpoint; Agent Vault projects are never user-facing, so keep it out of the API docs
      hide: true,
      operationId: "getAgentVaultProject",
      description: "Resolve the organization's Agent Vault project, creating it on first access",
      tags: [ApiDocsTags.AgentVaultAccessBundles],
      response: { 200: z.object({ projectId: z.string() }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    // A deliberate REST deviation, confirmed rather than silently shipped: injectAgentVaultProjectId is a
    // preValidation hook, so this GET creates the project on first access. Lazy bootstrap is the point —
    // every org that predates the feature gets its project the first time someone opens the product.
    handler: async (req) => ({ projectId: req.internalAgentVaultProjectId })
  });
};
