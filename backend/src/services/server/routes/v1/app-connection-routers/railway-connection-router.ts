import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRailwayConnectionSchema,
  SanitizedRailwayConnectionSchema,
  UpdateRailwayConnectionSchema
} from "@app/services/app-connection/railway";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRailwayConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Railway,
    server,
    sanitizedResponseSchema: SanitizedRailwayConnectionSchema,
    createSchema: CreateRailwayConnectionSchema,
    updateSchema: UpdateRailwayConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listRailwayProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z
            .object({
              name: z.string(),
              id: z.string(),
              services: z.array(
                z.object({
                  name: z.string(),
                  id: z.string()
                })
              ),
              environments: z.array(
                z.object({
                  name: z.string(),
                  id: z.string()
                })
              )
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.railway.listProjects(connectionId, req.permission);

      return { projects };
    }
  });
};
