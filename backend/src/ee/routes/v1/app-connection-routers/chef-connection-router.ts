import z from "zod";

import {
  CreateChefConnectionSchema,
  SanitizedChefConnectionSchema,
  UpdateChefConnectionSchema
} from "@app/ee/services/app-connections/chef";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { registerAppConnectionEndpoints } from "@app/server/routes/v1/app-connection-routers/app-connection-endpoints";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerChefConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Chef,
    server,
    sanitizedResponseSchema: SanitizedChefConnectionSchema,
    createSchema: CreateChefConnectionSchema,
    updateSchema: UpdateChefConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/data-bags`,
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
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const dataBags = await server.services.appConnection.chef.listDataBags(connectionId, req.permission);

      return dataBags;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/data-bag-items`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        dataBagName: z.string()
      }),
      response: {
        200: z
          .object({
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const { dataBagName } = req.query;
      const dataBagItems = await server.services.appConnection.chef.listDataBagItems(
        connectionId,
        dataBagName,
        req.permission
      );

      return dataBagItems;
    }
  });
};
