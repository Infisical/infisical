import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { GatewayTimeoutError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { CustomAWSHasher } from "./hashing";

export const AWS_ACCOUNT_DETECTION_TIMEOUT_MS = 10_000;

// "No credentials" is also what a slow instance metadata service reports at boot, so it is checked again after this
// long instead of being trusted forever.
export const AWS_ACCOUNT_RECHECK_MS = 5 * 60 * 1000;

// GetCallerIdentity does no work on AWS's side and usually answers in well under a second. These limits are short
// enough that both attempts (maxAttempts: 2) fit inside AWS_ACCOUNT_DETECTION_TIMEOUT_MS, so a slow STS still gets
// its retry before the overall cap ends the check.
const STS_REQUEST_TIMEOUTS = { connectionTimeout: 2_000, requestTimeout: 3_000, throwOnRequestTimeout: true };

export type TInstanceAwsCredentials = { accessKeyId: string; secretAccessKey: string };

export type TAwsAccountLookup =
  | { status: "found"; accountId: string }
  | { status: "no-credentials" }
  | { status: "failed" };

// In FIPS mode, STS has FIPS endpoints only in US (including GovCloud) and Canadian regions; elsewhere the SDK builds
// a hostname that doesn't exist. Other commercial regions use us-east-1's FIPS endpoint, since the account ID is the
// same from any region in the partition. China is its own partition with no FIPS STS, so it keeps its region and the
// regular endpoint.
export const getStsClientConfig = (isFipsMode: boolean) => {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  if (!isFipsMode) return { region, useFipsEndpoint: false };
  if (region.startsWith("cn-")) return { region, useFipsEndpoint: false };
  if (/^(us|ca)-/.test(region)) return { region, useFipsEndpoint: true };
  return { region: "us-east-1", useFipsEndpoint: true };
};

const readCallerAccount = async (sts: STSClient, abortSignal: AbortSignal): Promise<TAwsAccountLookup> => {
  try {
    const { Account } = await sts.send(new GetCallerIdentityCommand({}), { abortSignal });
    if (!Account) return { status: "failed" };
    return { status: "found", accountId: Account };
  } catch (err) {
    if (abortSignal.aborted) return { status: "failed" };

    // The default credential chain found nothing, which is the normal outcome when Infisical is not on AWS.
    if ((err as { name?: string }).name === "CredentialsProviderError") {
      logger.debug("AWS account detection: no AWS credentials found, so the instance is not running on AWS");
      return { status: "no-credentials" };
    }

    logger.warn(err, "AWS account detection: could not read the AWS account ID with STS GetCallerIdentity");
    return { status: "failed" };
  }
};

// Without credentials, the SDK uses its default chain: the EC2 instance profile, ECS task role, or EKS IRSA / Pod
// Identity, the same principal AWS App Connections assume roles as.
export const detectInstanceAwsAccountId = async (
  credentials: TInstanceAwsCredentials | undefined,
  timeoutMs = AWS_ACCOUNT_DETECTION_TIMEOUT_MS
): Promise<TAwsAccountLookup> => {
  const sts = new STSClient({
    ...getStsClientConfig(crypto.isFipsModeEnabled()),
    sha256: CustomAWSHasher,
    credentials,
    requestHandler: STS_REQUEST_TIMEOUTS,
    maxAttempts: 2
  });

  const abortController = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  // The abort signal only reaches the STS request. Credential providers (IMDS, ECS, IRSA's own STS call) don't
  // see it, so the race is what bounds the whole lookup.
  const timedOut = new Promise<TAwsAccountLookup>((resolve) => {
    timer = setTimeout(() => {
      abortController.abort();
      logger.warn(`AWS account detection: gave up after ${timeoutMs}ms without an answer from AWS`);
      resolve({ status: "failed" });
    }, timeoutMs);
  });

  try {
    return await Promise.race([readCallerAccount(sts, abortController.signal), timedOut]);
  } finally {
    clearTimeout(timer);
    sts.destroy();
  }
};

// Only a hash of the credentials is kept, so this module never holds a second copy of the secret. A failed lookup
// is never cached, so the next request tries again.
let cached: { credentialsHash: string; accountId: string | null; checkedAt: number } | undefined;
let inFlight: { credentialsHash: string; lookup: Promise<TAwsAccountLookup> } | undefined;

const hashCredentials = (credentials: TInstanceAwsCredentials | undefined) =>
  crypto.nativeCrypto
    .createHash("sha256")
    .update(credentials ? `${credentials.accessKeyId}:${credentials.secretAccessKey}` : "default-chain")
    .digest("hex");

// Called per request with the App Connection credentials read from the overridable env, so a key change made in the
// Server Console is picked up on the next request. Returns null only when the instance has no AWS identity; a failed
// lookup throws, so callers such as Terraform never mistake a transient failure for that answer.
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
      const result = await detectInstanceAwsAccountId(credentials);
      if (result.status === "found") {
        cached = { credentialsHash, accountId: result.accountId, checkedAt: Date.now() };
        logger.info(`AWS account detection: Infisical runs as AWS account ${result.accountId}`);
      } else if (result.status === "no-credentials") {
        cached = { credentialsHash, accountId: null, checkedAt: Date.now() };
      }
      return result;
    };
    const lookup = run().finally(() => {
      if (inFlight?.lookup === lookup) inFlight = undefined;
    });
    inFlight = { credentialsHash, lookup };
  }

  const result = await inFlight.lookup;
  if (result.status === "failed") {
    throw new GatewayTimeoutError({
      message:
        "Infisical couldn't read its AWS account ID from AWS STS. Try again shortly. If it keeps failing, check that the instance can reach AWS STS and that the AWS App Connection access keys, if set, are valid."
    });
  }
  return result.status === "found" ? result.accountId : null;
};
