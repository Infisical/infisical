import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateHumanitecConnectionSchema,
  HumanitecOrgWithApps,
  SanitizedHumanitecConnectionSchema,
  UpdateHumanitecConnectionSchema
} from "@app/services/app-connection/humanitec";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerHumanitecConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Humanitec,
    server,
    sanitizedResponseSchema: SanitizedHumanitecConnectionSchema,
    createSchema: CreateHumanitecConnectionSchema,
    updateSchema: UpdateHumanitecConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listHumanitecOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            apps: z
              .object({
                id: z.string(),
                name: z.string(),
                envs: z
                  .object({
                    id: z.string(),
                    name: z.string()
                  })
                  .array()
              })
              .array()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const organizations: HumanitecOrgWithApps[] = await server.services.appConnection.humanitec.listOrganizations(
        connectionId,
        req.permission
      );

      return organizations;
    }
  });
};
