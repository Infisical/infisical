import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import AWS from "aws-sdk";
import { randomUUID } from "crypto";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { AwsConnectionMethod } from "./aws-connection-enums";
import { TAwsConnectionConfig } from "./aws-connection-types";

export const getAwsAppConnectionListItem = () => {
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
        RoleSessionName: `infisical-app-connection-${randomUUID()}`,
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

export const validateAwsConnectionCredentials = async (appConnection: TAwsConnectionConfig) => {
  const awsConfig = await getAwsConnectionConfig(appConnection);
  const sts = new AWS.STS(awsConfig);
  let resp: Awaited<ReturnType<ReturnType<typeof sts.getCallerIdentity>["promise"]>>;

  try {
    resp = await sts.getCallerIdentity().promise();
  } catch (e: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection - verify credentials`
    });
  }

  if (resp.$response.httpResponse.statusCode !== 200)
    throw new InternalServerError({
      message: `Unable to validate credentials: ${
        resp.$response.error?.message ??
        `AWS responded with a status code of ${resp.$response.httpResponse.statusCode}. Verify credentials and try again.`
      }`
    });

  return appConnection.credentials;
};
