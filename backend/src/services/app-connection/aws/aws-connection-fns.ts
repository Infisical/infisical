import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient, STSServiceException } from "@aws-sdk/client-sts";
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

  return {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken
    }
  };
};

export const validateAwsConnectionCredentials = async (appConnection: TAwsConnectionConfig) => {
  try {
    const awsConfig = await getAwsConnectionConfig(appConnection);
    const sts = new STSClient({
      region: awsConfig.region,
      credentials: awsConfig.credentials
    });

    await sts.send(new GetCallerIdentityCommand({}));
  } catch (error: unknown) {
    logger.error(error, "Error validating AWS connection credentials");

    // v3 SDK throws on non-2xx responses (v2 resolved and required manual status check).
    // Preserve the original InternalServerError for AWS-level failures.
    if (error instanceof STSServiceException) {
      throw new InternalServerError({
        message: `Unable to validate credentials: ${
          error.message ??
          `AWS responded with a status code of ${error.$metadata.httpStatusCode}. Verify credentials and try again.`
        }`
      });
    }

    let message: string;

    if (error instanceof AxiosError) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      message = (error.response?.data?.message as string) || error.message || "verify credentials";
    } else {
      message = (error as Error)?.message || "verify credentials";
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${message}`
    });
  }

  return appConnection.credentials;
};
