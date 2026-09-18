import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient, STSServiceException } from "@aws-sdk/client-sts";
import { AxiosError } from "axios";

import { ProjectType } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionRaw } from "@app/services/app-connection/app-connection-types";

import { AwsConnectionMethod } from "./aws-connection-enums";
import { TAwsConnectionConfig } from "./aws-connection-types";

// Regional and VPC PrivateLink STS endpoints reject requests whose SigV4 credential scope region
// doesn't match the endpoint's region. In AWS STS hosts the region is the label following the "sts"
// (or "sts-fips") service label (e.g. sts.eu-west-1.amazonaws.com,
// vpce-0abc.sts.eu-west-1.vpce.amazonaws.com), so parse it out of the host. Returns undefined for the
// global endpoint (sts.amazonaws.com) and non-AWS hosts (e.g. LocalStack), where the caller's region
// is used and region scoping isn't enforced.
const getStsSigningRegion = (stsEndpoint?: string) => {
  if (!stsEndpoint) {
    return {
      region: null,
      isValidEndpoint: false
    };
  }

  try {
    const { hostname } = new URL(stsEndpoint);

    const labels = hostname.split(".");
    const stsLabelIndex = labels.findIndex((label) => label === "sts" || label === "sts-fips");
    const region = stsLabelIndex === -1 ? undefined : labels[stsLabelIndex + 1];

    // the global endpoint (sts.amazonaws.com) has the domain in the region position, not a region
    if (region === "amazonaws") {
      return {
        region: null,
        isValidEndpoint: false
      };
    }

    return {
      region,
      isValidEndpoint: true
    };
  } catch {
    return {
      region: null,
      isValidEndpoint: false
    };
  }
};

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

  const { method, credentials, orgId, projectId, version, projectType } = appConnection;

  switch (method) {
    case AwsConnectionMethod.AssumeRole: {
      const stsRegion = getStsSigningRegion(credentials.stsEndpoint);

      const client = new STSClient({
        region: stsRegion.region || region,
        sha256: CustomAWSHasher,
        // only override the endpoint when explicitly set; otherwise preserve the SDK's
        // default region/FIPS endpoint resolution so existing connections are unaffected
        ...(credentials.stsEndpoint && stsRegion.isValidEndpoint
          ? { endpoint: credentials.stsEndpoint }
          : {
              useFipsEndpoint: crypto.isFipsModeEnabled()
            }),
        credentials:
          appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID && appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: appCfg.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID,
                secretAccessKey: appCfg.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
              }
            : undefined // if hosting on AWS
      });

      // v1 (legacy) always used orgId; v2+ uses projectId when available, orgId otherwise.
      // Certificate Manager connections try orgId first (the recommended ExternalID),
      // then fall back to projectId for backwards compatibility with existing trust policies.
      const externalIds: string[] = [];
      if ((version ?? 1) >= 2) {
        if (projectType === ProjectType.CertificateManager) {
          externalIds.push(orgId);
          if (projectId && projectId !== orgId) externalIds.push(projectId);
        } else {
          externalIds.push(projectId ?? orgId);
        }
      } else {
        externalIds.push(orgId);
      }

      let assumeRes;
      let lastErr: unknown;
      for (const externalId of externalIds) {
        try {
          const command = new AssumeRoleCommand({
            RoleArn: credentials.roleArn,
            RoleSessionName: `infisical-app-connection-${crypto.nativeCrypto.randomUUID()}`,
            DurationSeconds: 900, // 15 mins
            ExternalId: externalId
          });
          // eslint-disable-next-line no-await-in-loop
          assumeRes = await client.send(command);
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          logger.info(`AssumeRole with ExternalId failed, trying next candidate [roleArn=${credentials.roleArn}]`);
        }
      }
      if (lastErr) throw lastErr as Error;

      if (!assumeRes?.Credentials?.AccessKeyId || !assumeRes?.Credentials?.SecretAccessKey) {
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

export const buildAwsConnectionConfig = (
  connection: Pick<TAppConnectionRaw, "orgId" | "projectId" | "version" | "method"> & { projectType?: string },
  credentials: TAwsConnectionConfig["credentials"]
): TAwsConnectionConfig =>
  ({
    app: AppConnection.AWS,
    method: connection.method as AwsConnectionMethod,
    credentials,
    orgId: connection.orgId,
    projectId: connection.projectId,
    version: connection.version,
    projectType: connection.projectType
  }) as TAwsConnectionConfig;

export const validateAwsConnectionCredentials = async (appConnection: TAwsConnectionConfig) => {
  const stsEndpoint =
    appConnection.method === AwsConnectionMethod.AssumeRole ? appConnection.credentials.stsEndpoint : undefined;
  const stsRegion = getStsSigningRegion(stsEndpoint);

  if (stsEndpoint && (!stsRegion.region || !(Object.values(AWSRegion) as string[]).includes(stsRegion.region))) {
    throw new BadRequestError({
      message: `STS endpoint must target a supported AWS region. "${stsEndpoint}" does not resolve to a supported region.`
    });
  }

  try {
    const awsConfig = await getAwsConnectionConfig(appConnection);

    const sts = new STSClient({
      region: stsRegion.region ?? awsConfig.region,
      credentials: awsConfig.credentials,
      ...(stsEndpoint && stsRegion.isValidEndpoint ? { endpoint: stsEndpoint } : {})
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

export const getAwsAccountId = async (appConnection: TAwsConnectionConfig): Promise<string | null> => {
  try {
    const awsConfig = await getAwsConnectionConfig(appConnection);

    const stsEndpoint =
      appConnection.method === AwsConnectionMethod.AssumeRole ? appConnection.credentials.stsEndpoint : undefined;
    const stsRegion = getStsSigningRegion(stsEndpoint);

    const sts = new STSClient({
      region: stsRegion.region ?? awsConfig.region,
      credentials: awsConfig.credentials,
      ...(stsEndpoint && stsRegion.isValidEndpoint ? { endpoint: stsEndpoint } : {})
    });

    const response = await sts.send(new GetCallerIdentityCommand({}));
    return response.Account ?? null;
  } catch (error) {
    logger.error(error, "Failed to retrieve AWS account ID via STS");
    return null;
  }
};
