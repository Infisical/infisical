import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCoolifyConnectionSchema,
  SanitizedCoolifyConnectionSchema,
  UpdateCoolifyConnectionSchema
} from "@app/services/app-connection/coolify";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";
import { readLimit } from "@app/server/config/rateLimiter";
import { z } from "zod";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerCoolifyConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Coolify,
    server,
    sanitizedResponseSchema: SanitizedCoolifyConnectionSchema,
    createSchema: CreateCoolifyConnectionSchema,
    updateSchema: UpdateCoolifyConnectionSchema
  });

  server.route({
    method: "GET",
    url: "/:connectionId/applications",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            uuid: z.string(),
            name: z.string(),
            projectName: z.string(),
            environmentName: z.string(),
            created_at: z.string(),
            updated_at: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const applications = await server.services.appConnection.coolify.listApplications(connectionId, req.permission);
      return applications;
    }
  });
};
