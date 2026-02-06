import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGitHubRadarConnectionSchema,
  SanitizedGitHubRadarConnectionSchema,
  UpdateGitHubRadarConnectionSchema
} from "@app/services/app-connection/github-radar";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGitHubRadarConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GitHubRadar,
    server,
    sanitizedResponseSchema: SanitizedGitHubRadarConnectionSchema,
    createSchema: CreateGitHubRadarConnectionSchema,
    updateSchema: UpdateGitHubRadarConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGitHubRadarRepositories",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          repositories: z.object({ id: z.number(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const repositories = await server.services.appConnection.githubRadar.listRepositories(
        connectionId,
        req.permission
      );

      return { repositories };
    }
  });
};
