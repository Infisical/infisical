import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDatabricksConnectionSchema,
  SanitizedDatabricksConnectionSchema,
  UpdateDatabricksConnectionSchema
} from "@app/services/app-connection/databricks";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDatabricksConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Databricks,
    server,
    sanitizedResponseSchema: SanitizedDatabricksConnectionSchema,
    createSchema: CreateDatabricksConnectionSchema,
    updateSchema: UpdateDatabricksConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/secret-scopes`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          secretScopes: z.object({ name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const secretScopes = await server.services.appConnection.databricks.listSecretScopes(
        connectionId,
        req.permission
      );

      return { secretScopes };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/service-principals`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          servicePrincipals: z
            .object({
              id: z.string(),
              name: z.string(),
              clientId: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const servicePrincipals = await server.services.appConnection.databricks.listServicePrincipals(
        connectionId,
        req.permission
      );

      return { servicePrincipals };
    }
  });
};
