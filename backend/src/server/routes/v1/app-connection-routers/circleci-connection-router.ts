import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCircleCIConnectionSchema,
  SanitizedCircleCIConnectionSchema,
  UpdateCircleCIConnectionSchema
} from "@app/services/app-connection/circleci";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCircleCIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.CircleCI,
    server,
    sanitizedResponseSchema: SanitizedCircleCIConnectionSchema,
    createSchema: CreateCircleCIConnectionSchema,
    updateSchema: UpdateCircleCIConnectionSchema
  });

  server.route({
    method: "GET",
    url: "/:connectionId/projects",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCircleCIProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z.object({ id: z.string(), name: z.string(), slug: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.circleci.listProjects(connectionId, req.permission);
      return { projects };
    }
  });
};
