import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCloudflareConnectionSchema,
  SanitizedCloudflareConnectionSchema,
  UpdateCloudflareConnectionSchema
} from "@app/services/app-connection/cloudflare/cloudflare-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCloudflareConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Cloudflare,
    server,
    sanitizedResponseSchema: SanitizedCloudflareConnectionSchema,
    createSchema: CreateCloudflareConnectionSchema,
    updateSchema: UpdateCloudflareConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-pages-projects`,
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
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.cloudflare.listPagesProjects(connectionId, req.permission);

      return projects;
    }
  });
};
