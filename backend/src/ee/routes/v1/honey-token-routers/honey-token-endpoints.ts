import { z } from "zod";

import { HoneyTokenConfigsSchema } from "@app/db/schemas";
import { HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import {
  THoneyTokenConfigByType,
  THoneyTokenTestConnectionResponseByType
} from "@app/ee/services/honey-token/honey-token-provider-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedHoneyTokenConfigSchema = HoneyTokenConfigsSchema.pick({
  id: true,
  orgId: true,
  type: true,
  connectionId: true,
  status: true,
  createdAt: true,
  updatedAt: true
});

export const registerHoneyTokenEndpoints = <TType extends HoneyTokenType>({
  server,
  type,
  configSchema,
  testConnectionResponseSchema,
  decryptedConfigSchema
}: {
  server: FastifyZodProvider;
  type: TType;
  configSchema: z.ZodType<THoneyTokenConfigByType[TType], z.ZodTypeDef, unknown>;
  testConnectionResponseSchema: z.ZodType<THoneyTokenTestConnectionResponseByType[TType], z.ZodTypeDef, unknown>;
  decryptedConfigSchema: z.ZodType<THoneyTokenConfigByType[TType], z.ZodTypeDef, unknown>;
}) => {
  const upsertBodySchema = z.object({
    connectionId: z.string().uuid(),
    config: configSchema
  });
  const routeTestConnectionResponseSchema: z.ZodTypeAny = testConnectionResponseSchema;
  const routeDecryptedConfigSchema: z.ZodTypeAny = decryptedConfigSchema;

  server.route({
    url: "/configs",
    method: "PUT",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: upsertBodySchema,
      response: {
        200: z.object({
          config: SanitizedHoneyTokenConfigSchema
        })
      }
    },
    handler: async (req) => {
      const { connectionId, config } = upsertBodySchema.parse(req.body);
      const parsedConfig = configSchema.parse(config);
      const savedConfig = await server.services.honeyTokenConfig.upsertConfig({
        orgPermission: req.permission,
        type,
        connectionId,
        config: parsedConfig
      });

      return { config: savedConfig };
    }
  });

  server.route({
    url: "/configs/test-connection",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: routeTestConnectionResponseSchema
      }
    },
    handler: async (req) => {
      const response = await server.services.honeyTokenConfig.testConnection({
        orgPermission: req.permission,
        type
      });
      return testConnectionResponseSchema.parse(response);
    }
  });

  server.route({
    url: "/configs",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          config: SanitizedHoneyTokenConfigSchema.extend({
            decryptedConfig: routeDecryptedConfigSchema.nullable()
          }).nullable()
        })
      }
    },
    handler: async (req) => {
      const config = await server.services.honeyTokenConfig.getConfig({
        orgPermission: req.permission,
        type
      });

      if (!config) {
        return { config: null };
      }

      return {
        config: {
          ...config,
          decryptedConfig: config.decryptedConfig ? decryptedConfigSchema.parse(config.decryptedConfig) : null
        }
      };
    }
  });

  server.route({
    url: "/trigger",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.unknown(),
      response: {
        200: z.object({
          acknowledged: z.boolean()
        })
      }
    },
    handler: async (req) => {
      const { acknowledged } = await server.services.honeyToken.handleTrigger({
        type,
        signature: req.headers["x-infisical-signature"] as string | undefined,
        payload: req.body
      });

      return { acknowledged };
    }
  });
};
