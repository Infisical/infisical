import { z } from "zod";

import { HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import { AwsHoneyTokenConfigSchema } from "@app/ee/services/honey-token/honey-token-types";

import { registerHoneyTokenEndpoints } from "./honey-token-endpoints";

export const registerAwsHoneyTokenRouter = async (server: FastifyZodProvider) =>
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
