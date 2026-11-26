import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateJenkinsConnectionSchema,
  SanitizedJenkinsConnectionSchema,
  UpdateJenkinsConnectionSchema
} from "@app/services/app-connection/jenkins";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerJenkinsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Jenkins,
    server,
    sanitizedResponseSchema: SanitizedJenkinsConnectionSchema,
    createSchema: CreateJenkinsConnectionSchema,
    updateSchema: UpdateJenkinsConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/folders`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listJenkinsFolders",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          folders: z
            .object({
              fullName: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const folders = await server.services.appConnection.jenkins.listFolders(connectionId, req.actor);

      return { folders };
    }
  });
};
