import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  CreateADCSConnectionSchema,
  SanitizedADCSConnectionSchema,
  UpdateADCSConnectionSchema
} from "@app/services/app-connection/adcs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerADCSConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.ADCS,
    server,
    sanitizedResponseSchema: SanitizedADCSConnectionSchema,
    createSchema: CreateADCSConnectionSchema,
    updateSchema: UpdateADCSConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/certificate-templates`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAdcsCertificateTemplates",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        caName: z.string().trim().min(1).optional()
      }),
      response: {
        200: z.object({
          templates: z.object({ name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { caName } = req.query;
      const templates = await server.services.appConnection.adcs.listCertificateTemplates(
        connectionId,
        caName,
        req.permission
      );
      return { templates };
    }
  });
};
