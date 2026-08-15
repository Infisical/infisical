import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { PortainerConnectionMethod } from "./portainer-connection-enums";
import {
  TPortainerConnection,
  TPortainerConnectionConfig,
  TPortainerEnvironment,
  TPortainerStack
} from "./portainer-connection-types";

type TPortainerEnvironmentResponse = {
  Id: number;
  Name: string;
};

type TPortainerStackResponse = {
  Id: number;
  Name: string;
  EndpointId: number;
  GitConfig?: { URL: string } | null;
};

// URL validation and private-IP blocking happen at request time inside `safeRequest`, which
// also pins the connection to the validated IPs, preventing DNS rebinding between check and request.
export const getPortainerInstanceUrl = (config: TPortainerConnectionConfig) =>
  removeTrailingSlash(config.credentials.instanceUrl);

export const getPortainerRequestHeaders = (apiToken: string) => ({
  "X-API-Key": apiToken,
  Accept: "application/json"
});

export const getPortainerConnectionListItem = () => {
  return {
    name: "Portainer" as const,
    app: AppConnection.Portainer as const,
    methods: Object.values(PortainerConnectionMethod) as [PortainerConnectionMethod.ApiToken]
  };
};

export const validatePortainerConnectionCredentials = async (config: TPortainerConnectionConfig) => {
  const instanceUrl = getPortainerInstanceUrl(config);
  const { apiToken } = config.credentials;

  try {
    await safeRequest.get(`${instanceUrl}/api/users/me`, {
      headers: getPortainerRequestHeaders(apiToken)
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Portainer credentials: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: `Failed to validate Portainer credentials - verify the instance URL and API token are correct`
    });
  }

  return config.credentials;
};

export const listPortainerEnvironments = async (
  appConnection: TPortainerConnection
): Promise<TPortainerEnvironment[]> => {
  const instanceUrl = getPortainerInstanceUrl(appConnection);
  const { apiToken } = appConnection.credentials;

  try {
    // Returns the complete list when the optional start/limit query parameters are omitted
    const { data } = await safeRequest.get<TPortainerEnvironmentResponse[]>(`${instanceUrl}/api/endpoints`, {
      headers: getPortainerRequestHeaders(apiToken)
    });

    return data.map((environment) => ({ id: environment.Id, name: environment.Name }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Portainer environments: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list Portainer environments",
      error
    });
  }
};

export const listPortainerStacks = async (appConnection: TPortainerConnection): Promise<TPortainerStack[]> => {
  const instanceUrl = getPortainerInstanceUrl(appConnection);
  const { apiToken } = appConnection.credentials;

  try {
    // The stack list endpoint is not paginated
    const { data } = await safeRequest.get<TPortainerStackResponse[]>(`${instanceUrl}/api/stacks`, {
      headers: getPortainerRequestHeaders(apiToken)
    });

    return data.map((stack) => ({
      id: stack.Id,
      name: stack.Name,
      environmentId: stack.EndpointId,
      // Git-backed stacks accept environment variable updates without a redeploy; file-based ones do not
      isGitBased: Boolean(stack.GitConfig?.URL)
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Portainer stacks: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list Portainer stacks",
      error
    });
  }
};
