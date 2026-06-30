import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { Cloud66ConnectionMethod } from "./cloud-66-connection-enums";
import { TCloud66Connection, TCloud66ConnectionConfig, TCloud66Stack } from "./cloud-66-connection-types";

export const CLOUD_66_API_BASE_URL = "https://app.cloud66.com/api";

export const getCloud66ConnectionListItem = () => {
  return {
    name: "Cloud 66" as const,
    app: AppConnection.Cloud66 as const,
    methods: Object.values(Cloud66ConnectionMethod) as [Cloud66ConnectionMethod.AccessToken]
  };
};

export const validateCloud66ConnectionCredentials = async (config: TCloud66ConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    await request.get(`${CLOUD_66_API_BASE_URL}/3/stacks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    logger.error({ error }, "failed to validate cloud 66 connection");

    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid Personal Access Token"
    });
  }

  return config.credentials;
};

export const listCloud66Stacks = async (appConnection: TCloud66Connection): Promise<TCloud66Stack[]> => {
  const { accessToken } = appConnection.credentials;

  const stacks: TCloud66Stack[] = [];
  let page: number | null = 1;

  while (page) {
    // eslint-disable-next-line no-await-in-loop
    const res = await request.get(`${CLOUD_66_API_BASE_URL}/3/stacks?page=${page}&per_page=30`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    const { response, pagination } = res.data as {
      response: { uid: string; name: string }[];
      pagination?: { next: number | null };
    };

    stacks.push(...response.map((stack) => ({ id: stack.uid, name: stack.name })));

    page = pagination?.next ?? null;
  }

  return stacks;
};
