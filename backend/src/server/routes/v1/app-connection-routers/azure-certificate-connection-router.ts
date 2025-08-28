import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAzureCertificateConnectionSchema,
  SanitizedAzureCertificateConnectionSchema,
  UpdateAzureCertificateConnectionSchema
} from "@app/services/app-connection/azure-certificate";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAzureCertificateConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AzureCertificate,
    server,
    sanitizedResponseSchema: SanitizedAzureCertificateConnectionSchema,
    createSchema: CreateAzureCertificateConnectionSchema,
    updateSchema: UpdateAzureCertificateConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/services`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          services: z.object({ name: z.string(), id: z.string(), appId: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const services = await server.services.appConnection.azureCertificate.listServices(connectionId, req.permission);

      return { services };
    }
  });
};
