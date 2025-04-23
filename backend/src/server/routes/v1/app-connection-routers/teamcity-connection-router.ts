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

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
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
      console.log("HIT1");
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.teamcity.listProjects(connectionId, req.permission);

      console.log(projects);

      return projects;
    }
  });
};
