import { HttpStatusCode, isAxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { KeeperConnectionMethod } from "./keeper-connection-enums";
import { TKeeperConnectionConfig, TKeeperExecuteCommandResponse } from "./keeper-connection-types";

export const getKeeperConnectionListItem = () => {
  return {
    name: "Keeper" as const,
    app: AppConnection.Keeper as const,
    methods: Object.values(KeeperConnectionMethod) as [KeeperConnectionMethod.ApiKey]
  };
};

export const validateKeeperConnectionCredentials = async (config: TKeeperConnectionConfig) => {
  const { apiKey, instanceUrl } = config.credentials;
  const baseUrl = removeTrailingSlash(instanceUrl);

  let response: TKeeperExecuteCommandResponse | undefined;
  try {
    const { data } = await safeRequest.post<TKeeperExecuteCommandResponse>(
      `${baseUrl}/api/v1/executecommand`,
      { command: "whoami" },
      {
        headers: {
          "api-key": apiKey,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    response = data;
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (isAxiosError(error) && error.response) {
      const { status } = error.response;

      if (status === HttpStatusCode.Unauthorized || status === HttpStatusCode.Forbidden) {
        throw new BadRequestError({
          message: "Unable to validate connection: the Keeper API key was rejected. Verify the key and try again."
        });
      }

      throw new BadRequestError({
        message: `Unable to validate connection: Keeper Commander returned ${status} status. Verify the instance URL and API key and try again.`
      });
    }

    throw new BadRequestError({
      message:
        "Unable to validate connection: could not reach Keeper Commander. Verify the instance URL points to a running Commander Service Mode instance."
    });
  }

  if (response?.status !== "success") {
    throw new BadRequestError({
      message:
        "Unable to validate connection: Keeper Commander did not accept the request. Verify the API key is allowed to run the 'whoami' command."
    });
  }

  return config.credentials;
};
