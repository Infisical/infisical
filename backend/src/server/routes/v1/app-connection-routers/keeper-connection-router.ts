import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateKeeperConnectionSchema,
  SanitizedKeeperConnectionSchema,
  UpdateKeeperConnectionSchema
} from "@app/services/app-connection/keeper";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerKeeperConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Keeper,
    server,
    sanitizedResponseSchema: SanitizedKeeperConnectionSchema,
    createSchema: CreateKeeperConnectionSchema,
    updateSchema: UpdateKeeperConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/shared-folders`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listKeeperSharedFolders",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sharedFolders: z
            .object({
              uid: z.string(),
              name: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const sharedFolders = await server.services.appConnection.keeper.listSharedFolders(connectionId, req.permission);
      return { sharedFolders };
    }
  });
};
