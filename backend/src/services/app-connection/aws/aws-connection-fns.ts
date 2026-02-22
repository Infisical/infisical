import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import AWS from "aws-sdk";
import { AxiosError } from "axios";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { AwsConnectionMethod } from "./aws-connection-enums";
import { TAwsConnectionConfig } from "./aws-connection-types";

export const getAwsConnectionListItem = () => {
  const { INF_APP_CONNECTION_AWS_ACCESS_KEY_ID } = getConfig();

  return {
    name: "AWS" as const,
    app: AppConnection.AWS as const,
    methods: Object.values(AwsConnectionMethod) as [AwsConnectionMethod.AssumeRole, AwsConnectionMethod.AccessKey],
    accessKeyId: INF_APP_CONNECTION_AWS_ACCESS_KEY_ID
  };
};

export const getAwsConnectionConfig = async (appConnection: TAwsConnectionConfig, region = AWSRegion.US_EAST_1) => {
  const appCfg = getConfig();

  let accessKeyId: string;
  let secretAccessKey: string;
  let sessionToken: undefined | string;

  const { method, credentials, orgId } = appConnection;

  switch (method) {
    case AwsConnectionMethod.AssumeRole: {
      const client = new STSClient({
        region,
        useFipsEndpoint: crypto.isFipsModeEnabled(),
        sha256: CustomAWSHasher,
        credentials:
          appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID && appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID,
                secretAccessKey: appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
              }
            : undefined // if hosting on AWS
      });

      const command = new AssumeRoleCommand({
        RoleArn: credentials.roleArn,
        RoleSessionName: `infisical-app-connection-${crypto.nativeCrypto.randomUUID()}`,
        DurationSeconds: 900, // 15 mins
        ExternalId: orgId
      });

      const assumeRes = await client.send(command);

      if (!assumeRes.Credentials?.AccessKeyId || !assumeRes.Credentials?.SecretAccessKey) {
        throw new BadRequestError({ message: "Failed to assume role - verify credentials and role configuration" });
      }

      accessKeyId = assumeRes.Credentials.AccessKeyId;
      secretAccessKey = assumeRes.Credentials.SecretAccessKey;
      sessionToken = assumeRes.Credentials?.SessionToken;
      break;
    }
    case AwsConnectionMethod.AccessKey: {
      accessKeyId = credentials.accessKeyId;
      secretAccessKey = credentials.secretAccessKey;
      break;
    }
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new InternalServerError({ message: `Unsupported AWS connection method: ${method}` });
  }

  return new AWS.Config({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken
    }
  });
};

// AWS IAM role propagation can take several seconds after creation. When an IAM role is created
// and immediately used for AssumeRole (e.g. via Terraform), the call may fail with an AccessDenied
// error. We retry with exponential backoff to handle this eventual consistency.
const AWS_ASSUME_ROLE_MAX_RETRIES = 4;
const AWS_ASSUME_ROLE_RETRY_BASE_DELAY_MS = 5_000;

const isAssumeRoleAccessDeniedError = (error: unknown): boolean => {
  const err = error as { name?: string; message?: string };
  // AWS SDK v3 sets name to "AccessDenied" for STS authorization failures
  if (err.name === "AccessDenied" && err.message?.includes("sts:AssumeRole")) {
    return true;
  }
  // Fallback to message-based matching for other SDK versions / error shapes
  return (err.message || "").includes("is not authorized to perform: sts:AssumeRole");
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const validateAwsConnectionCredentials = async (appConnection: TAwsConnectionConfig) => {
  let resp: AWS.STS.GetCallerIdentityResponse & {
    $response: AWS.Response<AWS.STS.GetCallerIdentityResponse, AWS.AWSError>;
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= AWS_ASSUME_ROLE_MAX_RETRIES; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const awsConfig = await getAwsConnectionConfig(appConnection);
      const sts = new AWS.STS(awsConfig);

      // eslint-disable-next-line no-await-in-loop
      resp = await sts.getCallerIdentity().promise();
      lastError = undefined;
      break;
    } catch (error: unknown) {
      lastError = error;

      if (isAssumeRoleAccessDeniedError(error) && attempt < AWS_ASSUME_ROLE_MAX_RETRIES) {
        const delayMs = AWS_ASSUME_ROLE_RETRY_BASE_DELAY_MS * 2 ** attempt;
        logger.info(
          `AWS AssumeRole not yet authorized (attempt ${attempt + 1}/${AWS_ASSUME_ROLE_MAX_RETRIES + 1}). Retrying in ${delayMs / 1000}s due to likely IAM propagation delay...`
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayMs);
      } else {
        break;
      }
    }
  }

  if (lastError) {
    logger.error(lastError, "Error validating AWS connection credentials");

    let message: string;

    if (lastError instanceof AxiosError) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      message = (lastError.response?.data?.message as string) || lastError.message || "verify credentials";
    } else {
      message = (lastError as Error)?.message || "verify credentials";
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${message}`
    });
  }

  if (resp!.$response.httpResponse.statusCode !== 200)
    throw new InternalServerError({
      message: `Unable to validate credentials: ${
        resp!.$response.error?.message ??
        `AWS responded with a status code of ${resp!.$response.httpResponse.statusCode}. Verify credentials and try again.`
      }`
    });

  return appConnection.credentials;
};
