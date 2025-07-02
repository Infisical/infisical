import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { BitBucketConnectionMethod } from "./bitbucket-connection-enums";
import { TBitBucketConnectionConfig } from "./bitbucket-connection-types";

export const getBitBucketConnectionListItem = () => {
  return {
    name: "BitBucket" as const,
    app: AppConnection.BitBucket as const,
    methods: Object.values(BitBucketConnectionMethod) as [BitBucketConnectionMethod.ApiToken]
  };
};

export const validateBitBucketConnectionCredentials = async (config: TBitBucketConnectionConfig) => {
  const { email, apiToken } = config.credentials;

  try {
    await request.get("https://api.bitbucket.org/2.0/user", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json"
      }
    });
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

  return config.credentials;
};
