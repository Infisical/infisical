import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateVenafiConnectionSchema,
  SanitizedVenafiConnectionSchema,
  UpdateVenafiConnectionSchema
} from "@app/services/app-connection/venafi/venafi-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerVenafiConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Venafi,
    server,
    sanitizedResponseSchema: SanitizedVenafiConnectionSchema,
    createSchema: CreateVenafiConnectionSchema,
    updateSchema: UpdateVenafiConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/venafi-applications`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listVenafiApplications",
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const applications = await server.services.appConnection.venafi.listApplications(connectionId, req.permission);
      return applications;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/venafi-issuing-templates`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listVenafiIssuingTemplates",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        applicationId: z.string().uuid("Application ID must be a valid UUID")
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { applicationId } = req.query;

      const templates = await server.services.appConnection.venafi.listIssuingTemplates(
        connectionId,
        applicationId,
        req.permission
      );
      return templates;
    }
  });
};
