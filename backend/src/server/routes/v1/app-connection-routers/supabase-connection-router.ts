import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSupabaseConnectionSchema,
  SanitizedSupabaseConnectionSchema,
  UpdateSupabaseConnectionSchema
} from "@app/services/app-connection/supabase";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSupabaseConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Supabase,
    server,
    sanitizedResponseSchema: SanitizedSupabaseConnectionSchema,
    createSchema: CreateSupabaseConnectionSchema,
    updateSchema: UpdateSupabaseConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSupabaseProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: z
            .object({
              name: z.string(),
              id: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.supabase.listProjects(connectionId, req.permission);

      return { projects };
    }
  });
};
