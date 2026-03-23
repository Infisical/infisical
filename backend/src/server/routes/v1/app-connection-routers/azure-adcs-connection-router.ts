import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureADCSConnectionSchema,
  SanitizedAzureADCSConnectionSchema,
  UpdateAzureADCSConnectionSchema
} from "@app/services/app-connection/azure-adcs";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureADCSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureADCS,
    server,
    sanitizedResponseSchema: SanitizedAzureADCSConnectionSchema,
    createSchema: CreateAzureADCSConnectionSchema,
    updateSchema: UpdateAzureADCSConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/adcs-templates`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAdcsTemplates",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          templates: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const templates = await server.services.appConnection.azureAdcs.listTemplates(connectionId, req.permission);
      return { templates };
    }
  });
};
