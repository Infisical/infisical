import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateTerraformCloudConnectionSchema,
  SanitizedTerraformCloudConnectionSchema,
  TTerraformCloudOrganization,
  UpdateTerraformCloudConnectionSchema
} from "@app/services/app-connection/terraform-cloud";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerTerraformCloudConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.TerraformCloud,
    server,
    sanitizedResponseSchema: SanitizedTerraformCloudConnectionSchema,
    createSchema: CreateTerraformCloudConnectionSchema,
    updateSchema: UpdateTerraformCloudConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTerraformCloudWorkspaces",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            variableSets: z
              .object({
                id: z.string(),
                name: z.string(),
                description: z.string().optional(),
                global: z.boolean().optional()
              })
              .array(),
            workspaces: z
              .object({
                id: z.string(),
                name: z.string()
              })
              .array()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const organizations: TTerraformCloudOrganization[] =
        await server.services.appConnection.terraformCloud.listOrganizations(connectionId, req.permission);

      return organizations;
    }
  });
};
