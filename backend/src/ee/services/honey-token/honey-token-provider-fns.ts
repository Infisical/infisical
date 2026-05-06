import { BadRequestError } from "@app/lib/errors";

import type {
  THoneyTokenConfigProvider,
  THoneyTokenConfigServiceFactoryDep
} from "../honey-token-config/honey-token-config-types";
import { AWS_HONEY_TOKEN_PROVIDER_DEFINITION } from "./aws/honey-token-aws-provider-definition";
import { HoneyTokenType } from "./honey-token-enums";
import type { THoneyTokenServiceFactoryDep } from "./honey-token-service";
import { THoneyTokenProviderDefinition, THoneyTokenProviderHooks } from "./honey-token-service-types";

const HONEY_TOKEN_PROVIDER_DEFINITIONS: THoneyTokenProviderDefinition[] = [AWS_HONEY_TOKEN_PROVIDER_DEFINITION];

export const HONEY_TOKEN_PROVIDER_MAP: Record<HoneyTokenType, THoneyTokenProviderDefinition> =
  HONEY_TOKEN_PROVIDER_DEFINITIONS.reduce(
    (acc, provider) => {
      acc[provider.type] = provider;
      return acc;
    },
    {} as Record<HoneyTokenType, THoneyTokenProviderDefinition>
  );

export const HONEY_TOKEN_CREDENTIALS_RESPONSE_SCHEMA_MAP = HONEY_TOKEN_PROVIDER_DEFINITIONS.reduce(
  (acc, provider) => {
    acc[provider.type] = provider.credentialsResponseSchema;
    return acc;
  },
  {} as Record<HoneyTokenType, THoneyTokenProviderDefinition["credentialsResponseSchema"]>
);

export const HONEY_TOKEN_REGISTER_ROUTER_MAP = HONEY_TOKEN_PROVIDER_DEFINITIONS.reduce(
  (acc, provider) => {
    if (provider.registerRouter) {
      acc[provider.type] = provider.registerRouter;
    }
    return acc;
  },
  {} as Partial<Record<HoneyTokenType, (server: FastifyZodProvider) => Promise<void>>>
);

export const getHoneyTokenProviderDefinition = (type: string) => {
  const provider = HONEY_TOKEN_PROVIDER_MAP[type as HoneyTokenType];
  if (!provider) {
    throw new BadRequestError({ message: "Unsupported honey token type" });
  }
  return provider;
};

export const getHoneyTokenServiceHooksByType = (
  deps: THoneyTokenServiceFactoryDep
): Record<HoneyTokenType, THoneyTokenProviderHooks> =>
  HONEY_TOKEN_PROVIDER_DEFINITIONS.reduce(
    (acc, provider) => {
      acc[provider.type] = provider.serviceHooksFactory(deps);
      return acc;
    },
    {} as Record<HoneyTokenType, THoneyTokenProviderHooks>
  );

export const getHoneyTokenConfigProvidersByType = (
  deps: THoneyTokenConfigServiceFactoryDep
): { [K in HoneyTokenType]: THoneyTokenConfigProvider<K> } =>
  HONEY_TOKEN_PROVIDER_DEFINITIONS.reduce(
    (acc, provider) => {
      acc[provider.type] = provider.configProviderFactory(deps);
      return acc;
    },
    {} as { [K in HoneyTokenType]: THoneyTokenConfigProvider<K> }
  );
