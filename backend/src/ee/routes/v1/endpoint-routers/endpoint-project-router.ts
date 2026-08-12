import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/project",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description:
        "Get the organization's Infisical Endpoint project. There is one per organization, created on first use.",
      response: {
        200: z.object({ projectId: z.string() })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.getProjectId(req.permission);
    }
  });
};
