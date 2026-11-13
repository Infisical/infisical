import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
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
        connectionId: z.string().uuid().describe(AppConnections.KEEPER.LIST_SHARED_FOLDERS.connectionId)
      }),
      response: {
        200: z.object({
          sharedFolders: z
            .object({
              uid: z.string().describe(AppConnections.KEEPER.LIST_SHARED_FOLDERS.uid),
              name: z.string().describe(AppConnections.KEEPER.LIST_SHARED_FOLDERS.name)
            })
            .array()
            .describe(AppConnections.KEEPER.LIST_SHARED_FOLDERS.sharedFolders)
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
