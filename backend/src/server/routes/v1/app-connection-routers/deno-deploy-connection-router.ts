import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateDenoDeployConnectionSchema,
  SanitizedDenoDeployConnectionSchema,
  UpdateDenoDeployConnectionSchema
} from "@app/services/app-connection/deno-deploy";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerDenoDeployConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.DenoDeploy,
    server,
    sanitizedResponseSchema: SanitizedDenoDeployConnectionSchema,
    createSchema: CreateDenoDeployConnectionSchema,
    updateSchema: UpdateDenoDeployConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/apps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listDenoDeployApps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            slug: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const apps = await server.services.appConnection.denoDeploy.listApps(connectionId, req.permission);
      return apps;
    }
  });
};
