import { z } from "zod";

import { AwsHoneyTokenDeploymentUnavailableReason } from "@app/ee/services/honey-token/aws/honey-token-aws-enums";
import { HoneyTokenManagedBy, HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import { AwsHoneyTokenConfigSchema } from "@app/ee/services/honey-token/honey-token-types";
import { AWS_HONEY_TOKENS } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerHoneyTokenEndpoints } from "./honey-token-endpoints";

export const registerAwsHoneyTokenRouter = async (server: FastifyZodProvider) => {
  registerHoneyTokenEndpoints({
    server,
    type: HoneyTokenType.AWS,
    configSchema: AwsHoneyTokenConfigSchema,
    decryptedConfigSchema: AwsHoneyTokenConfigSchema,
    testConnectionResponseSchema: z.object({
      isConnected: z.boolean(),
      status: z.string().nullable(),
      stackName: z.string()
    })
  });

  server.route({
    url: "/deployment-options",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    schema: {
      operationId: "listAwsHoneyTokenDeploymentOptions",
      response: {
        200: z.object({
          deploymentOptions: z
            .object({
              managedBy: z.nativeEnum(HoneyTokenManagedBy).describe(AWS_HONEY_TOKENS.LIST_DEPLOYMENT_OPTIONS.managedBy),
              unavailableReason: z
                .nativeEnum(AwsHoneyTokenDeploymentUnavailableReason)
                .nullable()
                .describe(AWS_HONEY_TOKENS.LIST_DEPLOYMENT_OPTIONS.unavailableReason)
            })
            .array()
            .describe(AWS_HONEY_TOKENS.LIST_DEPLOYMENT_OPTIONS.deploymentOptions)
        })
      }
    },
    handler: async (req) => {
      const deploymentOptions = await server.services.honeyTokenConfig.aws.listDeploymentOptions(req.permission);
      return { deploymentOptions };
    }
  });
};
