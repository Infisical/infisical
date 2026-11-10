import z from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateCloud66ConnectionSchema,
  SanitizedCloud66ConnectionSchema,
  TCloud66Stack,
  UpdateCloud66ConnectionSchema
} from "@app/services/app-connection/cloud-66";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCloud66ConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Cloud66,
    server,
    sanitizedResponseSchema: SanitizedCloud66ConnectionSchema,
    createSchema: CreateCloud66ConnectionSchema,
    updateSchema: UpdateCloud66ConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/stacks`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloud66Stacks",
      params: z.object({
        connectionId: z.string().uuid()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const stacks: TCloud66Stack[] = await server.services.appConnection.cloud66.listStacks(
        connectionId,
        req.permission
      );

      return stacks;
    }
  });
};
