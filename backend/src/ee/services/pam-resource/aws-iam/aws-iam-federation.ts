import { AssumeRoleCommand, Credentials, STSClient, STSClientConfig } from "@aws-sdk/client-sts";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { TAwsIamResourceConnectionDetails } from "./aws-iam-resource-types";

const AWS_STS_MIN_DURATION_SECONDS = 900;

// We hardcode us-east-1 because:
// 1. IAM is global - roles can be assumed from any STS regional endpoint
// 2. The temporary credentials returned work globally across all AWS regions
// 3. The target account's resources can be in any region - it doesn't affect STS calls
const AWS_STS_DEFAULT_REGION = "us-east-1";

const createStsClient = (credentials?: Credentials): STSClient => {
  const appCfg = getConfig();

  const config: STSClientConfig = {
    region: AWS_STS_DEFAULT_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher
  };

  if (credentials) {
    // Use provided credentials (for role chaining)
    config.credentials = {
      accessKeyId: credentials.AccessKeyId!,
      secretAccessKey: credentials.SecretAccessKey!,
      sessionToken: credentials.SessionToken
    };
  } else if (appCfg.PAM_AWS_ACCESS_KEY_ID && appCfg.PAM_AWS_SECRET_ACCESS_KEY) {
    // Use configured static credentials
    config.credentials = {
      accessKeyId: appCfg.PAM_AWS_ACCESS_KEY_ID,
      secretAccessKey: appCfg.PAM_AWS_SECRET_ACCESS_KEY
    };
  }
  // Otherwise uses instance profile if hosting on AWS

  return new STSClient(config);
};

/**
 * Assumes the PAM role and returns the credentials.
 * Returns null if assumption fails (for validation) or throws if throwOnError is true.
 */
const assumePamRole = async ({
  connectionDetails,
  projectId,
  sessionDuration = AWS_STS_MIN_DURATION_SECONDS,
  sessionNameSuffix = "validation",
  throwOnError = false
}: {
  connectionDetails: TAwsIamResourceConnectionDetails;
  projectId: string;
  sessionDuration?: number;
  sessionNameSuffix?: string;
  throwOnError?: boolean;
}): Promise<Credentials | null> => {
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
    if (throwOnError) {
      throw new InternalServerError({
        message: "Failed to assume PAM role - AWS STS did not return credentials"
      });
    }
    return null;
  }

  return result.Credentials;
};

/**
 * Assumes a target role using PAM role credentials (role chaining).
 * Returns null if assumption fails (for validation) or throws if throwOnError is true.
 */
const assumeTargetRole = async ({
  pamCredentials,
  targetRoleArn,
  projectId,
  roleSessionName,
  sessionDuration = AWS_STS_MIN_DURATION_SECONDS,
  throwOnError = false
}: {
  pamCredentials: Credentials;
  targetRoleArn: string;
  projectId: string;
  roleSessionName: string;
  sessionDuration?: number;
  throwOnError?: boolean;
}): Promise<Credentials | null> => {
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
    if (throwOnError) {
      throw new BadRequestError({
        message: "Failed to assume target role - verify the target role trust policy allows the PAM role to assume it"
      });
    }
    return null;
  }

  return result.Credentials;
};

export const validatePamRoleConnection = async (
  connectionDetails: TAwsIamResourceConnectionDetails,
  projectId: string
): Promise<boolean> => {
  try {
    const credentials = await assumePamRole({ connectionDetails, projectId });
    return credentials !== null;
  } catch {
    return false;
  }
};

export const validateTargetRoleAssumption = async ({
  connectionDetails,
  targetRoleArn,
  projectId
}: {
  connectionDetails: TAwsIamResourceConnectionDetails;
  targetRoleArn: string;
  projectId: string;
}): Promise<boolean> => {
  try {
    const pamCredentials = await assumePamRole({ connectionDetails, projectId });
    if (!pamCredentials) return false;

    const targetCredentials = await assumeTargetRole({
      pamCredentials,
      targetRoleArn,
      projectId,
      roleSessionName: `infisical-pam-target-validation-${Date.now()}`
    });
    return targetCredentials !== null;
  } catch {
    return false;
  }
};

/**
 * Assumes the target role and generates a federated console sign-in URL.
 */
export const generateConsoleFederationUrl = async ({
  connectionDetails,
  targetRoleArn,
  roleSessionName,
  projectId,
  sessionDuration
}: {
  connectionDetails: TAwsIamResourceConnectionDetails;
  targetRoleArn: string;
  roleSessionName: string;
  projectId: string;
  sessionDuration: number;
}): Promise<{ consoleUrl: string; expiresAt: Date }> => {
  const pamCredentials = await assumePamRole({
    connectionDetails,
    projectId,
    sessionDuration,
    sessionNameSuffix: "session",
    throwOnError: true
  });

  const targetCredentials = await assumeTargetRole({
    pamCredentials: pamCredentials!,
    targetRoleArn,
    projectId,
    roleSessionName,
    sessionDuration,
    throwOnError: true
  });

  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = targetCredentials!;

  // Generate federation URL
  const sessionJson = JSON.stringify({
    sessionId: AccessKeyId,
    sessionKey: SecretAccessKey,
    sessionToken: SessionToken
  });

  const federationEndpoint = "https://signin.aws.amazon.com/federation";

  const signinTokenUrl = `${federationEndpoint}?Action=getSigninToken&Session=${encodeURIComponent(sessionJson)}`;

  const tokenResponse = await request.get<{ SigninToken?: string }>(signinTokenUrl);

  if (!tokenResponse.data.SigninToken) {
    throw new InternalServerError({
      message: `AWS federation endpoint did not return a SigninToken: ${JSON.stringify(tokenResponse.data).substring(0, 200)}`
    });
  }

  const tokenData = tokenResponse.data;

  if (!tokenData.SigninToken) {
    throw new InternalServerError({
      message: `AWS federation endpoint did not return a SigninToken: ${JSON.stringify(tokenResponse.data).substring(0, 200)}`
    });
  }

  const consoleDestination = `https://console.aws.amazon.com/`;
  const consoleUrl = `${federationEndpoint}?Action=login&SigninToken=${encodeURIComponent(tokenData.SigninToken)}&Destination=${encodeURIComponent(consoleDestination)}`;

  return {
    consoleUrl,
    expiresAt: Expiration ?? new Date(Date.now() + sessionDuration * 1000)
  };
};
