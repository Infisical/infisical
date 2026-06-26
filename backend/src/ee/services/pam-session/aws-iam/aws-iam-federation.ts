import { AssumeRoleCommand, Credentials, STSClient, STSClientConfig } from "@aws-sdk/client-sts";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

export const AWS_STS_MIN_DURATION_SECONDS = 900;
export const AWS_STS_MAX_DURATION_ROLE_CHAINING_SECONDS = 3600;

const AWS_STS_DEFAULT_REGION = "us-east-1";

const createStsClient = (credentials?: Credentials): STSClient => {
  const appCfg = getConfig();

  const config: STSClientConfig = {
    region: AWS_STS_DEFAULT_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher
  };

  if (credentials) {
    config.credentials = {
      accessKeyId: credentials.AccessKeyId!,
      secretAccessKey: credentials.SecretAccessKey!,
      sessionToken: credentials.SessionToken
    };
  } else if (appCfg.PAM_AWS_ACCESS_KEY_ID && appCfg.PAM_AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: appCfg.PAM_AWS_ACCESS_KEY_ID,
      secretAccessKey: appCfg.PAM_AWS_SECRET_ACCESS_KEY
    };
  }

  return new STSClient(config);
};

const assumePamRole = async ({
  connectionDetails,
  projectId,
  sessionDuration = AWS_STS_MIN_DURATION_SECONDS,
  sessionNameSuffix = "validation"
}: {
  connectionDetails: { roleArn: string };
  projectId: string;
  sessionDuration?: number;
  sessionNameSuffix?: string;
}): Promise<Credentials> => {
  const stsClient = createStsClient();

  const result = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: connectionDetails.roleArn,
      RoleSessionName: `infisical-pam-${sessionNameSuffix}-${Date.now()}`,
      DurationSeconds: sessionDuration,
      ExternalId: projectId
    })
  );

  if (!result.Credentials) {
    throw new InternalServerError({
      message: "Failed to assume PAM role - AWS STS did not return credentials"
    });
  }

  return result.Credentials;
};

const assumeTargetRole = async ({
  pamCredentials,
  targetRoleArn,
  projectId,
  roleSessionName,
  sessionDuration = AWS_STS_MIN_DURATION_SECONDS
}: {
  pamCredentials: Credentials;
  targetRoleArn: string;
  projectId: string;
  roleSessionName: string;
  sessionDuration?: number;
}): Promise<Credentials> => {
  const chainedStsClient = createStsClient(pamCredentials);

  const result = await chainedStsClient.send(
    new AssumeRoleCommand({
      RoleArn: targetRoleArn,
      RoleSessionName: roleSessionName,
      DurationSeconds: sessionDuration,
      ExternalId: projectId
    })
  );

  if (!result.Credentials) {
    throw new BadRequestError({
      message: "Failed to assume target role - verify the target role trust policy allows the PAM role to assume it"
    });
  }

  return result.Credentials;
};

export type TAwsIamSessionCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: Date;
};

export const generateAwsIamSessionCredentials = async ({
  connectionDetails,
  targetRoleArn,
  roleSessionName,
  projectId,
  sessionDuration
}: {
  connectionDetails: { roleArn: string };
  targetRoleArn: string;
  roleSessionName: string;
  projectId: string;
  sessionDuration: number;
}): Promise<TAwsIamSessionCredentials> => {
  const pamCredentials = await assumePamRole({
    connectionDetails,
    projectId,
    sessionDuration,
    sessionNameSuffix: "session"
  });

  const targetCredentials = await assumeTargetRole({
    pamCredentials,
    targetRoleArn,
    projectId,
    roleSessionName,
    sessionDuration
  });

  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = targetCredentials;

  if (!AccessKeyId || !SecretAccessKey || !SessionToken) {
    throw new InternalServerError({
      message: "AWS STS returned credentials missing required fields"
    });
  }

  return {
    accessKeyId: AccessKeyId,
    secretAccessKey: SecretAccessKey,
    sessionToken: SessionToken,
    expiresAt: Expiration ?? new Date(Date.now() + sessionDuration * 1000)
  };
};

export const exchangeCredentialsForConsoleUrl = async (
  credentials: Pick<TAwsIamSessionCredentials, "accessKeyId" | "secretAccessKey" | "sessionToken">
): Promise<string> => {
  const sessionJson = JSON.stringify({
    sessionId: credentials.accessKeyId,
    sessionKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken
  });

  const federationEndpoint = "https://signin.aws.amazon.com/federation";
  const signinTokenUrl = `${federationEndpoint}?Action=getSigninToken&Session=${encodeURIComponent(sessionJson)}`;

  const tokenResponse = await request.get<{ SigninToken?: string }>(signinTokenUrl);

  if (!tokenResponse.data.SigninToken) {
    throw new InternalServerError({
      message: `AWS federation endpoint did not return a SigninToken: ${JSON.stringify(tokenResponse.data).substring(0, 200)}`
    });
  }

  const consoleDestination = `https://console.aws.amazon.com/`;
  return `${federationEndpoint}?Action=login&SigninToken=${encodeURIComponent(tokenResponse.data.SigninToken)}&Destination=${encodeURIComponent(consoleDestination)}`;
};

export const extractAwsAccountIdFromArn = (arn: string): string | null => {
  const parts = arn.split(":");
  return parts.length >= 5 ? parts[4] : null;
};
