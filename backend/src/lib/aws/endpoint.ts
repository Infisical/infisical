import { getConfig } from "@app/lib/config/env";

type TAwsEndpointEnv = {
  AWS_ENDPOINT_URL?: string;
  AWS_ENDPOINT_URL_STS?: string;
  AWS_IGNORE_CONFIGURED_ENDPOINT_URLS?: boolean;
};

// Resolves the STS URL used to verify signed sts:GetCallerIdentity requests (AWS IAM auth).
// These requests are replayed with a plain HTTP client rather than an AWS SDK client, so they don't
// pick up the SDK's standard endpoint env vars on their own. This mirrors the SDK's precedence:
// AWS_ENDPOINT_URL_STS, then AWS_ENDPOINT_URL, unless AWS_IGNORE_CONFIGURED_ENDPOINT_URLS is set.
// Only these instance-level (operator-set) variables are honoured. A tenant-configured endpoint must
// never reach this plain HTTP client, so `fallback` is used only when there is no signing region.
export const resolveStsVerificationUrl = (
  { region, fallback }: { region: string | null; fallback?: string },
  env: TAwsEndpointEnv
): string | undefined => {
  if (!env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS) {
    const fromEnv = env.AWS_ENDPOINT_URL_STS || env.AWS_ENDPOINT_URL;
    if (fromEnv) return fromEnv;
  }

  return region ? `https://sts.${region}.amazonaws.com` : fallback;
};

export const getStsVerificationUrl = (region: string | null, fallback?: string) =>
  resolveStsVerificationUrl({ region, fallback }, getConfig());
