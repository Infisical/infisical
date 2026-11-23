import { getConfig } from "@app/lib/config/env";

type TAwsEndpointEnv = {
  AWS_ENDPOINT_URL?: string;
  AWS_ENDPOINT_URL_STS?: string;
  AWS_IGNORE_CONFIGURED_ENDPOINT_URLS?: boolean;
};

// AWS IAM auth replays the caller's signed sts:GetCallerIdentity request with a plain HTTP client, which does not
// read the AWS SDK's endpoint variables on its own. This mirrors the SDK's precedence: AWS_ENDPOINT_URL_STS, then
// AWS_ENDPOINT_URL, unless AWS_IGNORE_CONFIGURED_ENDPOINT_URLS is set. Only these operator-set variables are read;
// nothing a tenant or caller controls may select the endpoint.
export const resolveStsEndpointOverride = (env: TAwsEndpointEnv): string | undefined => {
  if (env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS) return undefined;
  return env.AWS_ENDPOINT_URL_STS || env.AWS_ENDPOINT_URL || undefined;
};

export const getStsEndpointOverride = () => resolveStsEndpointOverride(getConfig());
