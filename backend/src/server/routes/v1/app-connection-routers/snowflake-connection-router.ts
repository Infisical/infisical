import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateSnowflakeConnectionSchema,
  SanitizedSnowflakeConnectionSchema,
  UpdateSnowflakeConnectionSchema
} from "@app/services/app-connection/snowflake";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerSnowflakeConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Snowflake,
    server,
    sanitizedResponseSchema: SanitizedSnowflakeConnectionSchema,
    createSchema: CreateSnowflakeConnectionSchema,
    updateSchema: UpdateSnowflakeConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/databases`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSnowflakeDatabases",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          databases: z.object({ name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const databases = await server.services.appConnection.snowflake.listDatabases(connectionId, req.permission);

      return { databases };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/schemas`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSnowflakeSchemas",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        database: z.string().min(1)
      }),
      response: {
        200: z.object({
          schemas: z.object({ name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { database }
      } = req;

      const schemas = await server.services.appConnection.snowflake.listSchemas(connectionId, database, req.permission);

      return { schemas };
    }
  });
};
