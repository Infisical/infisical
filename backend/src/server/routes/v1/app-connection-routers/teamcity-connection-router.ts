import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateTeamCityConnectionSchema,
  SanitizedTeamCityConnectionSchema,
  UpdateTeamCityConnectionSchema
} from "@app/services/app-connection/teamcity";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerTeamCityConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.TeamCity,
    server,
    sanitizedResponseSchema: SanitizedTeamCityConnectionSchema,
    createSchema: CreateTeamCityConnectionSchema,
    updateSchema: UpdateTeamCityConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listTeamCityProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            buildTypes: z.object({
              buildType: z
                .object({
                  id: z.string(),
                  name: z.string()
                })
                .array()
            })
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.teamcity.listProjects(connectionId, req.permission);

      return projects;
    }
  });
};
