import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateRenderConnectionSchema,
  SanitizedRenderConnectionSchema,
  UpdateRenderConnectionSchema
} from "@app/services/app-connection/render/render-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerRenderConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Render,
    server,
    sanitizedResponseSchema: SanitizedRenderConnectionSchema,
    createSchema: CreateRenderConnectionSchema,
    updateSchema: UpdateRenderConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/services`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listRenderServices",
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
      const services = await server.services.appConnection.render.listServices(connectionId, req.permission);

      return services;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/environment-groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listRenderEnvironmentGroups",
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
      const groups = await server.services.appConnection.render.listEnvironmentGroups(connectionId, req.permission);

      return groups;
    }
  });
};
