import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateJenkinsConnectionSchema,
  SanitizedJenkinsConnectionSchema,
  UpdateJenkinsConnectionSchema
} from "@app/services/app-connection/jenkins";
import { AuthMode } from "@app/services/auth/auth-type";

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

      const folders = await server.services.appConnection.jenkins.listFolders(connectionId, req.permission);

      return { folders };
    }
  });
};
