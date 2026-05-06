import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDigiCertConnectionSchema,
  SanitizedDigiCertConnectionSchema,
  UpdateDigiCertConnectionSchema
} from "@app/services/app-connection/digicert/digicert-connection-schemas";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDigiCertConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.DigiCert,
    server,
    sanitizedResponseSchema: SanitizedDigiCertConnectionSchema,
    createSchema: CreateDigiCertConnectionSchema,
    updateSchema: UpdateDigiCertConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDigiCertOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.number(),
            name: z.string(),
            displayName: z.string().optional(),
            status: z.string().optional()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      return server.services.appConnection.digicert.listOrganizations(connectionId, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/products`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDigiCertProducts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            nameId: z.string(),
            name: z.string(),
            type: z.string().optional(),
            validationType: z.string().optional()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      return server.services.appConnection.digicert.listProducts(connectionId, req.permission);
    }
  });
};
