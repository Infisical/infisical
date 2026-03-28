import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  CreateAwsConnectionSchema,
  SanitizedAwsConnectionSchema,
  UpdateAwsConnectionSchema
} from "@app/services/app-connection/aws";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerAwsConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.AWS,
    server,
    sanitizedResponseSchema: SanitizedAwsConnectionSchema,
    createSchema: CreateAwsConnectionSchema,
    updateSchema: UpdateAwsConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/kms-keys`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAwsKmsKeys",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        region: z.nativeEnum(AWSRegion),
        destination: z.enum([SecretSync.AWSParameterStore, SecretSync.AWSSecretsManager])
      }),
      response: {
        200: z.object({
          kmsKeys: z.object({ alias: z.string(), id: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const kmsKeys = await server.services.appConnection.aws.listKmsKeys(
        {
          connectionId,
          ...req.query
        },
        req.permission
      );

      return { kmsKeys };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/users`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listAwsIamUsers",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          iamUsers: z
            .object({
              UserName: z.string(),
              Arn: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const iamUsers = await server.services.appConnection.aws.listIamUsers(
        {
          connectionId
        },
        req.permission
      );

      return { iamUsers };
    }
  });
};
