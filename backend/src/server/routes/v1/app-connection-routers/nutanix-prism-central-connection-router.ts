import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateNutanixPrismCentralConnectionSchema,
  SanitizedNutanixPrismCentralConnectionSchema,
  UpdateNutanixPrismCentralConnectionSchema
} from "@app/services/app-connection/nutanix-prism-central";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerNutanixPrismCentralConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.NutanixPrismCentral,
    server,
    sanitizedResponseSchema: SanitizedNutanixPrismCentralConnectionSchema,
    createSchema: CreateNutanixPrismCentralConnectionSchema,
    updateSchema: UpdateNutanixPrismCentralConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/clusters`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listNutanixPrismCentralClusters",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          clusters: z.array(
            z.object({
              id: z.string(),
              name: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const clusters = await server.services.appConnection.nutanixPrismCentral.listClusters(
        { connectionId: req.params.connectionId },
        req.permission
      );
      return { clusters };
    }
  });
};
