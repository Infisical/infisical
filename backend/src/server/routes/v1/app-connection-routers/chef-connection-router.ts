import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateChefConnectionSchema,
  SanitizedChefConnectionSchema,
  UpdateChefConnectionSchema
} from "@app/services/app-connection/chef";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

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
