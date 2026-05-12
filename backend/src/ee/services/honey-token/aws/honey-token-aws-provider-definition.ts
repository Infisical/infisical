import { z } from "zod";

import { registerAwsHoneyTokenRouter } from "@app/ee/routes/v1/honey-token-routers/aws-honey-token-router";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HoneyTokenType } from "../honey-token-enums";
import type { THoneyTokenProviderDefinition } from "../honey-token-service-types";
import { AwsHoneyTokenConfigSchema } from "../honey-token-types";
import { honeyTokenAwsConfigProviderFactory } from "./honey-token-aws-fns";
import { honeyTokenAwsProviderHooksFactory } from "./honey-token-aws-service";
import { AwsHoneyTokenCredentialsSchema } from "./honey-token-aws-types";

export const AWS_HONEY_TOKEN_PROVIDER_DEFINITION: THoneyTokenProviderDefinition<HoneyTokenType.AWS> = {
  type: HoneyTokenType.AWS,
  name: "AWS",
  connectionApp: AppConnection.AWS,
  configSchema: AwsHoneyTokenConfigSchema,
  credentialsResponseSchema: z.object({
    type: z.literal(HoneyTokenType.AWS),
    credentials: AwsHoneyTokenCredentialsSchema
  }),
  serviceHooksFactory: ({ kmsService, appConnectionDAL }) =>
    honeyTokenAwsProviderHooksFactory({ kmsService, appConnectionDAL }),
  configProviderFactory: (deps) => honeyTokenAwsConfigProviderFactory(deps),
  registerRouter: registerAwsHoneyTokenRouter
};
