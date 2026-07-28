import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { SpaceliftConnectionMethod } from "./spacelift-connection-enums";
import { TSpaceliftConnection, TSpaceliftConnectionConfig } from "./spacelift-connection-types";

const SPACELIFT_ALLOWED_DOMAIN_SUFFIXES = ["spacelift.io"];

export const getSpaceliftInstanceUrl = (config: TSpaceliftConnectionConfig) => {
  const rawUrl = removeTrailingSlash(config.credentials.apiUrl);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError({ message: "Invalid Spacelift URL" });
  }

  if (parsed.protocol !== "https:") {
    throw new BadRequestError({ message: "Spacelift URL must use HTTPS" });
  }

  const { hostname } = parsed;
  const isAllowedHost = SPACELIFT_ALLOWED_DOMAIN_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
  if (!isAllowedHost) {
    throw new BadRequestError({
      message: "Spacelift URL must end with spacelift.io"
    });
  }

  return rawUrl;
};

export const getSpaceliftConnectionListItem = () => {
  return {
    name: "Spacelift" as const,
    app: AppConnection.Spacelift as const,
    methods: Object.values(SpaceliftConnectionMethod) as [SpaceliftConnectionMethod.ApiKeySecret]
  };
};

export const validateSpaceliftConnectionCredentials = async (config: TSpaceliftConnectionConfig) => {
  const instanceUrl = getSpaceliftInstanceUrl(config);
  const { apiKeyId, apiKeySecret } = config.credentials;

  try {
    const { data } = await safeRequest.post<{
      data?: { apiKeyUser?: { jwt: string } };
      errors?: { message: string }[];
    }>(
      `${instanceUrl}/graphql`,
      {
        query: `mutation GetSpaceliftToken($id: ID!, $secret: String!) { apiKeyUser(id: $id, secret: $secret) { jwt } }`,
        variables: { id: apiKeyId, secret: apiKeySecret }
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    if (data.errors?.length) {
      throw new BadRequestError({
        message: `Failed to validate Spacelift credentials: ${data.errors[0].message}`
      });
    }

    if (!data.data?.apiKeyUser?.jwt) {
      throw new BadRequestError({
        message: "Failed to validate Spacelift credentials: no JWT returned"
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Spacelift credentials: ${error.message}`
      });
    }

    throw new BadRequestError({
      message: "Failed to validate Spacelift credentials - verify the API URL and credentials are correct"
    });
  }

  return config.credentials;
};

type TSpaceliftContext = {
  id: string;
  name: string;
};

export const listSpaceliftContexts = async (appConnection: TSpaceliftConnection): Promise<TSpaceliftContext[]> => {
  const instanceUrl = removeTrailingSlash(appConnection.credentials.apiUrl);
  const { apiKeyId, apiKeySecret } = appConnection.credentials;

  const { data: authData } = await safeRequest.post<{
    data?: { apiKeyUser?: { jwt: string } };
    errors?: { message: string }[];
  }>(`${instanceUrl}/graphql`, {
    query: `mutation GetSpaceliftToken($id: ID!, $secret: String!) { apiKeyUser(id: $id, secret: $secret) { jwt } }`,
    variables: { id: apiKeyId, secret: apiKeySecret }
  });

  if (authData.errors?.length || !authData.data?.apiKeyUser?.jwt) {
    throw new BadRequestError({
      message: "Failed to authenticate with Spacelift"
    });
  }

  const { jwt } = authData.data.apiKeyUser;

  const { data: contextData } = await safeRequest.post<{
    data?: { contexts?: TSpaceliftContext[] };
    errors?: { message: string }[];
  }>(
    `${instanceUrl}/graphql`,
    {
      query: `{ contexts { id name } }`
    },
    {
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    }
  );

  if (contextData.errors?.length) {
    throw new BadRequestError({
      message: `Failed to list Spacelift contexts: ${contextData.errors[0].message}`
    });
  }

  return contextData.data?.contexts ?? [];
};
