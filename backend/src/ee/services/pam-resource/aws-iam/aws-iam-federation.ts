import { AssumeRoleCommand, STSClient, STSClientConfig } from "@aws-sdk/client-sts";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";

import { TAwsIamResourceConnectionDetails } from "./aws-iam-resource-types";

const AWS_STS_MIN_DURATION_SECONDS = 900;

// We hardcode us-east-1 because:
// 1. IAM is global - roles can be assumed from any STS regional endpoint
// 2. The temporary credentials returned work globally across all AWS regions
// 3. The target account's resources can be in any region - it doesn't affect STS calls
const AWS_STS_DEFAULT_REGION = "us-east-1";

const createStsClient = (): STSClient => {
  const appCfg = getConfig();

  const config: STSClientConfig = {
    region: AWS_STS_DEFAULT_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials:
      appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID && appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID,
            secretAccessKey: appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
          }
        : undefined // if hosting on AWS
  };

  return new STSClient(config);
};

export const validatePamRoleConnection = async (
  connectionDetails: TAwsIamResourceConnectionDetails,
  projectId: string
): Promise<boolean> => {
  const stsClient = createStsClient();

  try {
    await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: connectionDetails.roleArn,
        RoleSessionName: `infisical-pam-validation-${Date.now()}`,
        DurationSeconds: AWS_STS_MIN_DURATION_SECONDS,
        ExternalId: projectId
      })
    );

    return true;
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
  const stsClient = createStsClient();

  try {
    // First assume the PAM role
    const pamRoleCredentials = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: connectionDetails.roleArn,
        RoleSessionName: `infisical-pam-validation-${Date.now()}`,
        DurationSeconds: AWS_STS_MIN_DURATION_SECONDS,
        ExternalId: projectId
      })
    );

    if (!pamRoleCredentials.Credentials) {
      return false;
    }

    // Then use the PAM role credentials to assume the target role
    const pamStsClient = new STSClient({
      region: AWS_STS_DEFAULT_REGION,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      sha256: CustomAWSHasher,
      credentials: {
        accessKeyId: pamRoleCredentials.Credentials.AccessKeyId!,
        secretAccessKey: pamRoleCredentials.Credentials.SecretAccessKey!,
        sessionToken: pamRoleCredentials.Credentials.SessionToken
      }
    });

    await pamStsClient.send(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: `infisical-pam-target-validation-${Date.now()}`,
        DurationSeconds: AWS_STS_MIN_DURATION_SECONDS,
        ExternalId: projectId
      })
    );

    return true;
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
  const stsClient = createStsClient();

  // First assume the PAM role
  const pamRoleCredentials = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: connectionDetails.roleArn,
      RoleSessionName: `infisical-pam-${Date.now()}`,
      DurationSeconds: sessionDuration,
      ExternalId: projectId
    })
  );

  if (!pamRoleCredentials.Credentials) {
    throw new Error("Failed to assume PAM role");
  }

  // Role chaining: use PAM role credentials to assume the target role
  const pamStsClient = new STSClient({
    region: AWS_STS_DEFAULT_REGION,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: {
      accessKeyId: pamRoleCredentials.Credentials.AccessKeyId!,
      secretAccessKey: pamRoleCredentials.Credentials.SecretAccessKey!,
      sessionToken: pamRoleCredentials.Credentials.SessionToken
    }
  });

  const targetRoleCredentials = await pamStsClient.send(
    new AssumeRoleCommand({
      RoleArn: targetRoleArn,
      RoleSessionName: roleSessionName,
      DurationSeconds: sessionDuration,
      ExternalId: projectId
    })
  );

  if (!targetRoleCredentials.Credentials) {
    throw new Error("Failed to assume target role");
  }

  const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } = targetRoleCredentials.Credentials;

  // Generate federation URL
  const sessionJson = JSON.stringify({
    sessionId: AccessKeyId,
    sessionKey: SecretAccessKey,
    sessionToken: SessionToken
  });

  const federationEndpoint = "https://signin.aws.amazon.com/federation";

  const signinTokenUrl = `${federationEndpoint}?Action=getSigninToken&Session=${encodeURIComponent(sessionJson)}`;

  const tokenResponse = await fetch(signinTokenUrl);

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    // eslint-disable-next-line no-console
    throw new Error(`AWS federation endpoint returned error (${tokenResponse.status}): ${errorText.substring(0, 200)}`);
  }

  const responseText = await tokenResponse.text();
  let tokenData: { SigninToken: string };

  try {
    tokenData = JSON.parse(responseText) as { SigninToken: string };
  } catch {
    throw new Error(`AWS federation endpoint returned invalid response: ${responseText.substring(0, 200)}`);
  }

  if (!tokenData.SigninToken) {
    throw new Error(`AWS federation endpoint did not return a SigninToken: ${responseText.substring(0, 200)}`);
  }

  const consoleDestination = `https://console.aws.amazon.com/`;
  const consoleUrl = `${federationEndpoint}?Action=login&SigninToken=${encodeURIComponent(tokenData.SigninToken)}&Destination=${encodeURIComponent(consoleDestination)}`;

  return {
    consoleUrl,
    expiresAt: Expiration ?? new Date(Date.now() + sessionDuration * 1000)
  };
};
