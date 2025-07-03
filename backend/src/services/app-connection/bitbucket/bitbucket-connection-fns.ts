import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { BitBucketConnectionMethod } from "./bitbucket-connection-enums";
import { TBitBucketConnection, TBitBucketConnectionConfig, TBitBucketRepo } from "./bitbucket-connection-types";

export const getBitBucketConnectionListItem = () => {
  return {
    name: "BitBucket" as const,
    app: AppConnection.BitBucket as const,
    methods: Object.values(BitBucketConnectionMethod) as [BitBucketConnectionMethod.ApiToken]
  };
};

export const getBitBucketUser = async ({ email, apiToken }: { email: string; apiToken: string }) => {
  try {
    const { data } = await request.get<{ username: string }>(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/user`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
    });

    return data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateBitBucketConnectionCredentials = async (config: TBitBucketConnectionConfig) => {
  await getBitBucketUser(config.credentials);
  return config.credentials;
};

export const listBitBucketRepositories = async (appConnection: TBitBucketConnection) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
    Accept: "application/json"
  };

  let allRepos: TBitBucketRepo[] = [];
  let nextUrl: string | undefined = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories?role=member&pagelen=100`;
  let iterationCount = 0;

  // Limit to 10 iterations, fetching at most 10 * 100 = 1000 repositories
  while (nextUrl && iterationCount < 10) {
    // eslint-disable-next-line no-await-in-loop
    const { data }: { data: { values: TBitBucketRepo[]; next?: string } } = await request.get<{
      values: TBitBucketRepo[];
      next?: string;
    }>(nextUrl, {
      headers
    });

    allRepos = allRepos.concat(data.values);
    nextUrl = data.next;
    iterationCount += 1;
  }

  return allRepos;
};
