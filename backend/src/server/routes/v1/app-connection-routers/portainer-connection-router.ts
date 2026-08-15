import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreatePortainerConnectionSchema,
  SanitizedPortainerConnectionSchema,
  UpdatePortainerConnectionSchema
} from "@app/services/app-connection/portainer";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerPortainerConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Portainer,
    server,
    sanitizedResponseSchema: SanitizedPortainerConnectionSchema,
    createSchema: CreatePortainerConnectionSchema,
    updateSchema: UpdatePortainerConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/environments`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPortainerEnvironments",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          environments: z
            .object({
              id: z.number(),
              name: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const environments = await server.services.appConnection.portainer.listEnvironments(connectionId, req.permission);

      return { environments };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/stacks`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPortainerStacks",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          stacks: z
            .object({
              id: z.number(),
              name: z.string(),
              environmentId: z.number(),
              isGitBased: z.boolean()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const stacks = await server.services.appConnection.portainer.listStacks(connectionId, req.permission);

      return { stacks };
    }
  });
};
