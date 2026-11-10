import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import { CustomAWSHasher } from "./hashing";
import { getInfisicalAwsCredentials } from "./instance-credentials";
import { AWS_REQUEST_TIMEOUTS } from "./s3";

let instanceAwsAccountId: string | undefined;

export const getInstanceAwsAccountId = () => instanceAwsAccountId;

export const detectInstanceAwsAccountId = async (): Promise<string | undefined> => {
  const sts = new STSClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: getInfisicalAwsCredentials(),
    requestHandler: AWS_REQUEST_TIMEOUTS,
    maxAttempts: 2
  });

  try {
    const { Account } = await sts.send(new GetCallerIdentityCommand({}));
    return Account || undefined;
  } catch (err) {
    // The default credential chain found nothing, which is the normal outcome when Infisical is not on AWS.
    if ((err as { name?: string }).name === "CredentialsProviderError") {
      logger.debug("AWS account detection: no AWS credentials found, so the instance is not running on AWS");
      return undefined;
    }

    logger.warn(err, "AWS account detection: could not read the AWS account ID with STS GetCallerIdentity");
    return undefined;
  } finally {
    sts.destroy();
  }
};

// Not awaited at boot: off AWS the credential chain spends time probing instance metadata, and /api/status only
// needs the value once it is known.
export const startInstanceAwsAccountDetection = () => {
  void detectInstanceAwsAccountId()
    .then((accountId) => {
      instanceAwsAccountId = accountId;
      if (accountId) logger.info(`AWS account detection: Infisical runs as AWS account ${accountId}`);
    })
    .catch((err) => logger.warn(err, "AWS account detection failed"));
};
