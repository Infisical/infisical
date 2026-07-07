import { request } from "@app/lib/config/request";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LiteLLMConnectionMethod } from "./litellm-connection-enums";
import { TLiteLLMConnectionConfig } from "./litellm-connection-types";

export const getLiteLLMConnectionListItem = () => {
  return {
    name: "LiteLLM" as const,
    app: AppConnection.LiteLLM as const,
    methods: Object.values(LiteLLMConnectionMethod) as [LiteLLMConnectionMethod.ApiKey]
  };
};

export const validateLiteLLMConnectionCredentials = async (config: TLiteLLMConnectionConfig) => {
  const { apiKey, instanceUrl } = config.credentials;
  const baseUrl = removeTrailingSlash(instanceUrl);

  // Guard the user-supplied host against SSRF (blocks localhost/private IPs outside of dev mode)
  await blockLocalAndPrivateIpAddresses(baseUrl);

  try {
    await request.get(`${baseUrl}/key/info`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    logger.error(error);
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or instance URL"
    });
  }

  return config.credentials;
};
