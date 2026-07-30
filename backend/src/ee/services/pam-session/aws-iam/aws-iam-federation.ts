import { AssumeRoleCommand, Credentials, STSClient, STSClientConfig } from "@aws-sdk/client-sts";
import axios from "axios";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

export const AWS_STS_MIN_DURATION_SECONDS = 900;

const AWS_STS_DEFAULT_REGION = "us-east-1";

const createStsClient = (): STSClient => {
  const appCfg = getConfig();

  const config: STSClientConfig = {
    region: AWS_STS_DEFAULT_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher
  };

  if (appCfg.PAM_AWS_ACCESS_KEY_ID && appCfg.PAM_AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: appCfg.PAM_AWS_ACCESS_KEY_ID,
      secretAccessKey: appCfg.PAM_AWS_SECRET_ACCESS_KEY
    };
  }

  return new STSClient(config);
};

// Infisical assumes the account's role directly (single hop). The role's trust policy must allow
// Infisical's AWS account with the org's Infisical ID as the External ID (confused-deputy guard).
const assumeRole = async ({
  roleArn,
  externalId,
  roleSessionName,
  sessionDuration = AWS_STS_MIN_DURATION_SECONDS
}: {
  roleArn: string;
  externalId: string;
  roleSessionName: string;
  sessionDuration?: number;
}): Promise<Credentials> => {
  const stsClient = createStsClient();

  const result = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: roleSessionName,
      DurationSeconds: sessionDuration,
      ExternalId: externalId
    })
  );

  if (!result.Credentials) {
    throw new BadRequestError({
      message:
        "Failed to assume role - verify the role's trust policy allows Infisical using your Infisical Organization ID as the External ID"
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
  roleArn,
  externalId,
  roleSessionName,
  sessionDuration
}: {
  roleArn: string;
  externalId: string;
  roleSessionName: string;
  sessionDuration: number;
}): Promise<TAwsIamSessionCredentials> => {
  const credentials = await assumeRole({
    roleArn,
    externalId,
    roleSessionName,
    sessionDuration
  });

  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = credentials;

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

  const tokenResponse = await axios.get<{ SigninToken?: string }>(signinTokenUrl, { timeout: 10000 });

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
