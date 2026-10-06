import { ListBucketsCommand, S3ServiceException } from "@aws-sdk/client-s3";

import { createS3Client } from "@app/lib/aws/s3";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { S3CompatibleConnectionMethod, S3CompatibleProvider } from "./s3-compatible-connection-enums";
import { parseS3CompatibleEndpoint, S3_COMPATIBLE_PROVIDER_MAP } from "./s3-compatible-connection-schemas";
import { TS3CompatibleConnectionConfig } from "./s3-compatible-connection-types";

export const getS3CompatibleConnectionListItem = () => {
  return {
    name: "S3-Compatible Storage" as const,
    app: AppConnection.S3Compatible as const,
    methods: Object.values(S3CompatibleConnectionMethod) as [S3CompatibleConnectionMethod.AccessKey]
  };
};

export const getS3CompatibleConnectionConfig = ({
  credentials
}: {
  credentials: TS3CompatibleConnectionConfig["credentials"];
}) => {
  const parsed = parseS3CompatibleEndpoint(credentials.endpoint);
  if (!parsed) {
    throw new BadRequestError({
      message: "The S3-Compatible Storage connection's endpoint is not supported. Update the connection's endpoint."
    });
  }

  return {
    provider: parsed.provider,
    region: parsed.region,
    endpoint: parsed.provider === S3CompatibleProvider.AwsS3 ? undefined : parsed.origin,
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey }
  };
};

export const validateS3CompatibleConnectionCredentials = async (config: TS3CompatibleConnectionConfig) => {
  const { provider, ...clientConfig } = getS3CompatibleConnectionConfig(config);
  const providerName = S3_COMPATIBLE_PROVIDER_MAP[provider].name;

  try {
    await createS3Client(clientConfig).send(new ListBucketsCommand({}));
  } catch (error) {
    // keys scoped to a bucket can't list buckets, but an AccessDenied still means the key authenticated
    if (error instanceof S3ServiceException && error.name === "AccessDenied") return config.credentials;

    logger.warn(
      { err: error },
      `S3-Compatible Storage credential check failed [orgId=${config.orgId}] [provider=${provider}]`
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
