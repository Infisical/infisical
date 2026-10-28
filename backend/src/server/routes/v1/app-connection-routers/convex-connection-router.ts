import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateConvexConnectionSchema,
  SanitizedConvexConnectionSchema,
  UpdateConvexConnectionSchema
} from "@app/services/app-connection/convex";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerConvexConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Convex,
    server,
    sanitizedResponseSchema: SanitizedConvexConnectionSchema,
    createSchema: CreateConvexConnectionSchema,
    updateSchema: UpdateConvexConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/deployments`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listConvexDeployments",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            deploymentUrl: z.string(),
            name: z.string(),
            deploymentType: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const deployments = await server.services.appConnection.convex.listDeployments(connectionId, req.permission);
      return deployments;
    }
  });
};
