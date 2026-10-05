import { getConfig } from "@app/lib/config/env";
import { removeTrailingSlash } from "@app/lib/fn";

const DEFAULT_GLOBAL_STS_ENDPOINT = "https://sts.amazonaws.com";

type TAwsEndpointEnv = {
  AWS_ENDPOINT_URL?: string;
  AWS_ENDPOINT_URL_STS?: string;
  AWS_IGNORE_CONFIGURED_ENDPOINT_URLS?: boolean;
};

const isExplicitStsEndpoint = (endpoint?: string | null): endpoint is string =>
  Boolean(endpoint) && removeTrailingSlash((endpoint as string).trim()) !== DEFAULT_GLOBAL_STS_ENDPOINT;

// Resolves the STS URL used to verify signed sts:GetCallerIdentity requests (AWS IAM auth).
// These requests are replayed with a plain HTTP client rather than an AWS SDK client, so they don't
// pick up the SDK's endpoint configuration on their own. This mirrors the SDK's precedence:
// 1. an endpoint explicitly configured on the auth method (like an SDK client's `endpoint` option);
//    the global default (https://sts.amazonaws.com/) is stored when none is set and doesn't count,
// 2. AWS_ENDPOINT_URL_STS, then AWS_ENDPOINT_URL, unless AWS_IGNORE_CONFIGURED_ENDPOINT_URLS is set,
// 3. the regional endpoint for the request's signing region.
// The env vars are instance-level (set by the operator), so they don't widen what end users can target.
export const resolveStsVerificationUrl = (
  { region, configuredEndpoint }: { region: string | null; configuredEndpoint?: string | null },
  env: TAwsEndpointEnv
): string | undefined => {
  if (isExplicitStsEndpoint(configuredEndpoint)) return configuredEndpoint;

  if (!env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS) {
    const fromEnv = env.AWS_ENDPOINT_URL_STS || env.AWS_ENDPOINT_URL;
    if (fromEnv) return fromEnv;
  }

  return region ? `https://sts.${region}.amazonaws.com` : configuredEndpoint || undefined;
};

export const getStsVerificationUrl = (region: string | null, configuredEndpoint?: string | null) =>
  resolveStsVerificationUrl({ region, configuredEndpoint }, getConfig());
