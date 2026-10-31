import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
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
        connectionId: z.string().uuid().describe(AppConnections.CONVEX.LIST_DEPLOYMENTS.connectionId)
      }),
      response: {
        200: z
          .object({
            deploymentUrl: z.string().describe(AppConnections.CONVEX.LIST_DEPLOYMENTS.deploymentUrl),
            name: z.string().describe(AppConnections.CONVEX.LIST_DEPLOYMENTS.name),
            deploymentType: z.string().describe(AppConnections.CONVEX.LIST_DEPLOYMENTS.deploymentType)
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
