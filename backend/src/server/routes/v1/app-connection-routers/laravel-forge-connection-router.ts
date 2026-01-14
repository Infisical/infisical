import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateLaravelForgeConnectionSchema,
  SanitizedLaravelForgeConnectionSchema,
  UpdateLaravelForgeConnectionSchema
} from "@app/services/app-connection/laravel-forge";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerLaravelForgeConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.LaravelForge,
    server,
    sanitizedResponseSchema: SanitizedLaravelForgeConnectionSchema,
    createSchema: CreateLaravelForgeConnectionSchema,
    updateSchema: UpdateLaravelForgeConnectionSchema
  });
  server.route({
    method: "GET",
    url: `/:connectionId/organizations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLaravelForgeOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            slug: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const organizations = await server.services.appConnection.laravelForge.listOrganizations(
        connectionId,
        req.permission
      );

      return organizations;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/servers`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLaravelForgeServers",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        organizationSlug: z.string()
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
      const { organizationSlug } = req.query;
      const servers = await server.services.appConnection.laravelForge.listServers(
        connectionId,
        req.permission,
        organizationSlug
      );

      return servers;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/sites`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listLaravelForgeSites",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        organizationSlug: z.string(),
        serverId: z.string()
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
      const { organizationSlug, serverId } = req.query;
      const sites = await server.services.appConnection.laravelForge.listSites(
        connectionId,
        req.permission,
        organizationSlug,
        serverId
      );

      return sites;
    }
  });
};
