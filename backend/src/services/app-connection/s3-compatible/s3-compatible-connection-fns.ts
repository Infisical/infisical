import type { Agent } from "node:https";

import { ListBucketsCommand, S3ServiceException } from "@aws-sdk/client-s3";

import { createS3Client } from "@app/lib/aws/s3";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { buildSsrfSafeAgent } from "@app/lib/validator";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { AppConnection } from "../app-connection-enums";
import { S3CompatibleConnectionMethod, S3CompatibleProvider } from "./s3-compatible-connection-enums";
import {
  parseS3CompatibleEndpoint,
  S3_COMPATIBLE_ENDPOINT_ERROR,
  S3_COMPATIBLE_PROVIDER_MAP
} from "./s3-compatible-connection-schemas";
import { TS3CompatibleConnectionConfig } from "./s3-compatible-connection-types";

export const getS3CompatibleConnectionListItem = () => {
  return {
    name: "S3-Compatible Storage" as const,
    app: AppConnection.S3Compatible as const,
    methods: Object.values(S3CompatibleConnectionMethod) as [S3CompatibleConnectionMethod.AccessKey]
  };
};

const buildCustomHostAgent = async (origin: string, host: string) =>
  (await buildSsrfSafeAgent(origin, { allowPrivateIps: getConfig().S3_COMPATIBLE_STORAGE_ALLOW_INTERNAL_IP }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOTFOUND" && error.code !== "EAI_AGAIN") throw error;
      throw new BadRequestError({ message: `Could not resolve ${host}. Verify the hostname and try again.` });
    }
  )) as Agent | undefined;

export const getS3CompatibleConnectionConfig = async ({
  credentials
}: {
  credentials: TS3CompatibleConnectionConfig["credentials"];
}) => {
  const { allowedStorageHostnames } = await getServerCfg();
  const parsed = parseS3CompatibleEndpoint(credentials.endpoint, allowedStorageHostnames ?? [], credentials.region);
  if (!parsed) {
    throw new BadRequestError({ message: S3_COMPATIBLE_ENDPOINT_ERROR });
  }

  const providerName =
    parsed.provider === S3CompatibleProvider.Custom
      ? new URL(parsed.origin).host
      : S3_COMPATIBLE_PROVIDER_MAP[parsed.provider].name;

  return {
    providerName,
    region: parsed.region,
    endpoint: parsed.provider === S3CompatibleProvider.AwsS3 ? undefined : parsed.origin,
    getHttpsAgent:
      parsed.provider === S3CompatibleProvider.Custom
        ? () => buildCustomHostAgent(parsed.origin, providerName)
        : undefined,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey }
  };
};

export const validateS3CompatibleConnectionCredentials = async (config: TS3CompatibleConnectionConfig) => {
  const { providerName, getHttpsAgent, ...clientConfig } = await getS3CompatibleConnectionConfig(config);
  const httpsAgent = await getHttpsAgent?.();

  try {
    await createS3Client({ ...clientConfig, httpsAgent }).send(new ListBucketsCommand({}));
  } catch (error) {
    // keys scoped to a bucket can't list buckets, but an AccessDenied still means the key authenticated
    if (error instanceof S3ServiceException && error.name === "AccessDenied") return config.credentials;

    logger.warn(
      { err: error },
      `S3-Compatible Storage credential check failed [orgId=${config.orgId}] [provider=${providerName}]`
    );

    if (error instanceof S3ServiceException) {
      throw new BadRequestError({
        message: `${providerName} couldn't verify the access key: ${error.message || error.name}`
      });
    }

    throw new BadRequestError({
      message: `Could not reach ${providerName} at the configured endpoint. Verify the endpoint and try again.`
    });
  }

  return config.credentials;
};
