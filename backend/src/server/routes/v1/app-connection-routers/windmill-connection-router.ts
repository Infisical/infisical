import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateWindmillConnectionSchema,
  SanitizedWindmillConnectionSchema,
  UpdateWindmillConnectionSchema
} from "@app/services/app-connection/windmill";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerWindmillConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Windmill,
    server,
    sanitizedResponseSchema: SanitizedWindmillConnectionSchema,
    createSchema: CreateWindmillConnectionSchema,
    updateSchema: UpdateWindmillConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/workspaces`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listWindmillWorkspaces",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const workspaces = await server.services.appConnection.windmill.listWorkspaces(connectionId, req.permission);

      return workspaces;
    }
  });
};
