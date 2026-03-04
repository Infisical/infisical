import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDbtConnectionSchema,
  SanitizedDbtConnectionSchema,
  UpdateDbtConnectionSchema
} from "@app/services/app-connection/dbt";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDbtConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Dbt,
    server,
    sanitizedResponseSchema: SanitizedDbtConnectionSchema,
    createSchema: CreateDbtConnectionSchema,
    updateSchema: UpdateDbtConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDbtProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z
            .object({
              id: z.number(),
              name: z.string(),
              description: z.string(),
              createdAt: z.string(),
              updatedAt: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { connectionId }
      } = req;

      const projects = await server.services.appConnection.dbt.listProjects(connectionId, req.permission);
      return { projects };
    }
  });
};
