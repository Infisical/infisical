import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { FireworksConnectionMethod } from "./fireworks-connection-enums";
import { TFireworksConnection, TFireworksConnectionConfig } from "./fireworks-connection-types";

export const FIREWORKS_API_BASE_URL = "https://api.fireworks.ai";

export const getFireworksConnectionListItem = () => {
  return {
    name: "Fireworks" as const,
    app: AppConnection.Fireworks as const,
    methods: Object.values(FireworksConnectionMethod) as [FireworksConnectionMethod.ApiKey]
  };
};

export const validateFireworksConnectionCredentials = async (config: TFireworksConnectionConfig) => {
  const { apiKey, accountId } = config.credentials;

  try {
    await request.get(`${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      validateStatus: (status) => status === 200
    });
  } catch {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or account ID"
    });
  }

  return config.credentials;
};

export type TFireworksUser = {
  name: string;
  displayName: string;
  email: string;
  role: string;
  serviceAccount: boolean;
  state: string;
};

export const listFireworksUsers = async (appConnection: TFireworksConnection) => {
  const { apiKey, accountId } = appConnection.credentials;

  const users: TFireworksUser[] = [];
  let pageToken: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<{ users: TFireworksUser[]; nextPageToken?: string }>(
      `${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}/users`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        params: {
          pageSize: 200,
          ...(pageToken ? { pageToken } : {})
        }
      }
    );

    if (data.users) {
      users.push(...data.users.filter((u) => u.serviceAccount));
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return users;
};
