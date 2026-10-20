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
      hide: true,
      operationId: "getAgentVaultProject",
      description: "Resolve the organization's Agent Vault project, creating it on first access",
      tags: [ApiDocsTags.AgentVault],
      response: { 200: z.object({ projectId: z.string() }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    // A deliberate REST deviation: injectAgentVaultProjectId is a preValidation hook, so this GET
    // bootstraps the project on first access.
    handler: async (req) => ({ projectId: req.internalAgentVaultProjectId })
  });
};
