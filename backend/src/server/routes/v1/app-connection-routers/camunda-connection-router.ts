import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCamundaConnectionSchema,
  SanitizedCamundaConnectionSchema,
  UpdateCamundaConnectionSchema
} from "@app/services/app-connection/camunda";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCamundaConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Camunda,
    server,
    sanitizedResponseSchema: SanitizedCamundaConnectionSchema,
    createSchema: CreateCamundaConnectionSchema,
    updateSchema: UpdateCamundaConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/clusters`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCamundaClusters",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          clusters: z.object({ uuid: z.string(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const clusters = await server.services.appConnection.camunda.listClusters(connectionId, req.permission);

      return { clusters };
    }
  });
};
