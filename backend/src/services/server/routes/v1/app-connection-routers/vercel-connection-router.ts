import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateVercelConnectionSchema,
  SanitizedVercelConnectionSchema,
  UpdateVercelConnectionSchema,
  VercelOrgWithApps
} from "@app/services/app-connection/vercel";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerVercelConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Vercel,
    server,
    sanitizedResponseSchema: SanitizedVercelConnectionSchema,
    createSchema: CreateVercelConnectionSchema,
    updateSchema: UpdateVercelConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listVercelProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        projectSearch: z.string().optional()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            apps: z
              .object({
                id: z.string(),
                name: z.string(),
                envs: z
                  .object({
                    id: z.string(),
                    slug: z.string(),
                    type: z.string(),
                    target: z.array(z.string()).optional(),
                    description: z.string().optional(),
                    createdAt: z.number().optional(),
                    updatedAt: z.number().optional()
                  })
                  .array()
                  .optional(),
                previewBranches: z.array(z.string()).optional()
              })
              .array()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { projectSearch } = req.query;

      const projects: VercelOrgWithApps[] = await server.services.appConnection.vercel.listProjects(
        connectionId,
        req.permission,
        projectSearch
      );

      return projects;
    }
  });
};
