import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import { CustomAWSHasher } from "./hashing";
import { getInfisicalAwsCredentials } from "./instance-credentials";

export const AWS_ACCOUNT_DETECTION_TIMEOUT_MS = 10_000;

// GetCallerIdentity does no work on AWS's side and usually answers in well under a second. These limits are short
// enough that both attempts (maxAttempts: 2) fit inside AWS_ACCOUNT_DETECTION_TIMEOUT_MS, so a slow STS still gets
// its retry before the overall cap ends the check.
const STS_REQUEST_TIMEOUTS = { connectionTimeout: 2_000, requestTimeout: 3_000, throwOnRequestTimeout: true };

let instanceAwsAccountId: string | undefined;

export const getInstanceAwsAccountId = () => instanceAwsAccountId;

const readCallerAccount = async (sts: STSClient, abortSignal: AbortSignal) => {
  try {
    const { Account } = await sts.send(new GetCallerIdentityCommand({}), { abortSignal });
    return Account || undefined;
  } catch (err) {
    if (abortSignal.aborted) return undefined;

    // The default credential chain found nothing, which is the normal outcome when Infisical is not on AWS.
    if ((err as { name?: string }).name === "CredentialsProviderError") {
      logger.debug("AWS account detection: no AWS credentials found, so the instance is not running on AWS");
      return undefined;
    }

    logger.warn(err, "AWS account detection: could not read the AWS account ID with STS GetCallerIdentity");
    return undefined;
  }
};

export const detectInstanceAwsAccountId = async (
  timeoutMs = AWS_ACCOUNT_DETECTION_TIMEOUT_MS
): Promise<string | undefined> => {
  const sts = new STSClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: getInfisicalAwsCredentials(),
    requestHandler: STS_REQUEST_TIMEOUTS,
    maxAttempts: 2
  });

  const abortController = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  // The abort signal only reaches the STS request. Credential providers (IMDS, ECS, IRSA's own STS call) don't
  // see it, so the race is what bounds the whole lookup.
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      abortController.abort();
      logger.warn(`AWS account detection: gave up after ${timeoutMs}ms without an answer from AWS`);
      resolve(undefined);
    }, timeoutMs);
  });

  try {
    return await Promise.race([readCallerAccount(sts, abortController.signal), timedOut]);
  } finally {
    clearTimeout(timer);
    sts.destroy();
  }
};

// Not awaited at boot: off AWS the credential chain spends time probing instance metadata, and /api/status only
// needs the value once it is known. detectInstanceAwsAccountId bounds the time spent.
export const startInstanceAwsAccountDetection = () => {
  void detectInstanceAwsAccountId()
    .then((accountId) => {
      instanceAwsAccountId = accountId;
      if (accountId) logger.info(`AWS account detection: Infisical runs as AWS account ${accountId}`);
    })
    .catch((err) => logger.warn(err, "AWS account detection failed"));
};
