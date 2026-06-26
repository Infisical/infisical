import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateQoveryConnectionSchema,
  SanitizedQoveryConnectionSchema,
  UpdateQoveryConnectionSchema
} from "@app/services/app-connection/qovery";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerQoveryConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Qovery,
    server,
    sanitizedResponseSchema: SanitizedQoveryConnectionSchema,
    createSchema: CreateQoveryConnectionSchema,
    updateSchema: UpdateQoveryConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use (sync destination dropdowns)
  const qoveryResourceListSchema = z.object({ id: z.string(), name: z.string() }).array();

  server.route({
    method: "GET",
    url: "/:connectionId/organizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listQoveryOrganizations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: qoveryResourceListSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      return server.services.appConnection.qovery.listOrganizations(connectionId, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/organizations/:organizationId/projects",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listQoveryProjects",
      params: z.object({
        connectionId: z.string().uuid(),
        organizationId: z.string().min(1)
      }),
      response: {
        200: qoveryResourceListSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, organizationId } = req.params;

      return server.services.appConnection.qovery.listProjects(connectionId, organizationId, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId/projects/:projectId/environments",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listQoveryEnvironments",
      params: z.object({
        connectionId: z.string().uuid(),
        projectId: z.string().min(1)
      }),
      response: {
        200: qoveryResourceListSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, projectId } = req.params;

      return server.services.appConnection.qovery.listEnvironments(connectionId, projectId, req.permission);
    }
  });
};
