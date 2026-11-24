import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import { CustomAWSHasher } from "./hashing";

export const AWS_ACCOUNT_DETECTION_TIMEOUT_MS = 10_000;

// A failed lookup and "not on AWS" look the same from here (a slow instance metadata service at boot also surfaces
// as missing credentials), so a missing account is checked again after this long instead of being trusted forever.
export const AWS_ACCOUNT_RECHECK_MS = 5 * 60 * 1000;

// GetCallerIdentity does no work on AWS's side and usually answers in well under a second. These limits are short
// enough that both attempts (maxAttempts: 2) fit inside AWS_ACCOUNT_DETECTION_TIMEOUT_MS, so a slow STS still gets
// its retry before the overall cap ends the check.
const STS_REQUEST_TIMEOUTS = { connectionTimeout: 2_000, requestTimeout: 3_000, throwOnRequestTimeout: true };

export type TInstanceAwsCredentials = { accessKeyId: string; secretAccessKey: string };

// STS has FIPS endpoints only in US and Canadian regions (GovCloud's regular endpoints are FIPS validated). Elsewhere
// the SDK builds a hostname that doesn't exist, so FIPS mode falls back to us-east-1; the account ID is the same from
// any region in the partition.
export const getStsRegion = (isFipsMode: boolean) => {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  if (isFipsMode && !/^(us|ca)-/.test(region)) return "us-east-1";
  return region;
};

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

// Without credentials, the SDK uses its default chain: the EC2 instance profile, ECS task role, or EKS IRSA / Pod
// Identity, the same principal AWS App Connections assume roles as.
export const detectInstanceAwsAccountId = async (
  credentials: TInstanceAwsCredentials | undefined,
  timeoutMs = AWS_ACCOUNT_DETECTION_TIMEOUT_MS
): Promise<string | undefined> => {
  const isFipsMode = crypto.isFipsModeEnabled();
  const sts = new STSClient({
    region: getStsRegion(isFipsMode),
    sha256: CustomAWSHasher,
    useFipsEndpoint: isFipsMode,
    credentials,
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

// Only a hash of the credentials is kept, so this module never holds a second copy of the secret.
let cached: { credentialsHash: string; accountId: string | null; checkedAt: number } | undefined;
let inFlight: { credentialsHash: string; lookup: Promise<string | null> } | undefined;

const hashCredentials = (credentials: TInstanceAwsCredentials | undefined) =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(credentials ? `${credentials.accessKeyId}:${credentials.secretAccessKey}` : "default-chain")
    .digest("hex");

// Called per request with the App Connection credentials read from the overridable env, so a key change made in the
// Server Console is picked up on the next request. An account found for the same credentials is reused; concurrent
// requests share one lookup.
export const getInstanceAwsAccountId = async (credentials: TInstanceAwsCredentials | undefined) => {
  // The e2e test server serves this route too, and must not call AWS.
  if (getConfig().isTestMode) return null;

  const credentialsHash = hashCredentials(credentials);
  if (
    cached?.credentialsHash === credentialsHash &&
    (cached.accountId !== null || Date.now() - cached.checkedAt < AWS_ACCOUNT_RECHECK_MS)
  ) {
    return cached.accountId;
  }

  if (inFlight?.credentialsHash !== credentialsHash) {
    const run = async () => {
      const accountId = (await detectInstanceAwsAccountId(credentials)) ?? null;
      cached = { credentialsHash, accountId, checkedAt: Date.now() };
      if (accountId) logger.info(`AWS account detection: Infisical runs as AWS account ${accountId}`);
      return accountId;
    };
    const lookup = run().finally(() => {
      if (inFlight?.lookup === lookup) inFlight = undefined;
    });
    inFlight = { credentialsHash, lookup };
  }

  return inFlight.lookup;
};
