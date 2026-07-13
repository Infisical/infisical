import z from "zod";

import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      // Internal endpoint; PAM projects are never user-facing, so keep it out of the API docs
      hide: true,
      operationId: "getPamProject",
      description: "Resolve the organization's Privileged Access Manager project, creating it on first access",
      tags: [ApiDocsTags.PamFolders],
      response: {
        200: z.object({
          projectId: z.string()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    // injectPamProjectId (preValidation) has already resolved/bootstrapped the project by now.
    handler: async (req) => ({ projectId: req.internalPamProjectId })
  });
};
