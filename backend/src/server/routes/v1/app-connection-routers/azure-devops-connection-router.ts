import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureDevOpsConnectionSchema,
  SanitizedAzureDevOpsConnectionSchema,
  UpdateAzureDevOpsConnectionSchema
} from "@app/services/app-connection/azure-devops/azure-devops-schemas";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureDevOpsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureDevOps,
    server,
    sanitizedResponseSchema: SanitizedAzureDevOpsConnectionSchema,
    createSchema: CreateAzureDevOpsConnectionSchema,
    updateSchema: UpdateAzureDevOpsConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAzureDevOpsProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z.object({ name: z.string(), id: z.string(), appId: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.azureDevOps.listProjects(connectionId, req.permission);

      return { projects };
    }
  });
};
