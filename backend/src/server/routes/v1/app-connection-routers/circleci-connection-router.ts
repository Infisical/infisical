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
      operationId: "listCircleCIOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          organizations: z
            .object({
              name: z.string(),
              projects: z.object({ name: z.string(), id: z.string() }).array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const organizations = await server.services.appConnection.circleci.listOrganizations(
        connectionId,
        req.permission
      );
      return { organizations };
    }
  });
};
