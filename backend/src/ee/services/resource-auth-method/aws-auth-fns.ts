import RE2 from "re2";

import { isValidAwsRegion } from "@app/lib/aws/region";
import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { extractPrincipalArn } from "@app/services/identity-aws-auth/identity-aws-auth-fns";

import { TAwsGetCallerIdentityHeaders, TGetCallerIdentityResponse } from "./aws-auth-types";

// Parses the AWS region from the SigV4 Authorization header's Credential=… segment.
// Same approach as identity-aws-auth (services/identity-aws-auth/identity-aws-auth-service.ts).
// We trust the caller-provided region because the signature itself is bound to it; if the
// region is wrong, AWS STS will reject the proxied request.
const awsRegionFromHeader = (authorizationHeader: string): string | null => {
  // Authorization: AWS4-HMAC-SHA256 Credential=AKIA.../<date>/<region>/sts/aws4_request, ...
  try {
    const fields = authorizationHeader.split(" ");
    for (const field of fields) {
      if (field.startsWith("Credential=")) {
        const parts = field.split("/");
        if (parts.length >= 3) return parts[2];
      }
    }
  } catch {
    return null;
  }
  return null;
};

type TVerifyStsCallerInput = {
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
  defaultStsEndpoint: string;
  errorContext: { gatewayId: string; orgId: string; gatewayName: string };
};

/**
 * Verifies a signed STS GetCallerIdentity request and returns the caller's account/ARN/userId.
 * Throws UnauthorizedError on failure with errorContext attached so callers can audit-log it.
 */
export const verifyStsAndExtractCaller = async ({
  iamHttpRequestMethod,
  iamRequestBody,
  iamRequestHeaders,
  defaultStsEndpoint,
  errorContext
}: TVerifyStsCallerInput) => {
  let headers: TAwsGetCallerIdentityHeaders;
  let body: string;
  try {
    headers = JSON.parse(Buffer.from(iamRequestHeaders, "base64").toString()) as TAwsGetCallerIdentityHeaders;
    body = Buffer.from(iamRequestBody, "base64").toString();
  } catch {
    throw new UnauthorizedError({
      message: "Malformed signed STS request",
      detail: { reasonCode: "malformed_request", ...errorContext }
    });
  }

  const authHeader = headers.Authorization || headers.authorization;
  const region = authHeader ? awsRegionFromHeader(authHeader) : null;

  if (!isValidAwsRegion(region)) {
    throw new UnauthorizedError({
      message: "Invalid AWS region",
      detail: { reasonCode: "invalid_region", ...errorContext }
    });
  }

  const url = region ? `https://sts.${region}.amazonaws.com` : defaultStsEndpoint;

  let stsResponse: { data: TGetCallerIdentityResponse };
  try {
    stsResponse = await request({
      method: iamHttpRequestMethod,
      url,
      headers,
      data: body
    });
  } catch (err) {
    logger.error(err, `Resource AWS Auth Login: STS verification failed [gateway-id=${errorContext.gatewayId}]`);
    throw new UnauthorizedError({
      message: "STS verification failed",
      detail: { reasonCode: "sts_request_failed", ...errorContext }
    });
  }

  const {
    GetCallerIdentityResponse: {
      GetCallerIdentityResult: { Account, Arn, UserId }
    }
  } = stsResponse.data;

  return { Account, Arn, UserId };
};

type TValidateAllowlistsInput = {
  Account: string;
  Arn: string;
  allowedAccountIds: string;
  allowedPrincipalArns: string;
  errorContext: { gatewayId: string; orgId: string; gatewayName: string };
};

export const validateAllowlists = ({
  Account,
  Arn,
  allowedAccountIds,
  allowedPrincipalArns,
  errorContext
}: TValidateAllowlistsInput) => {
  // Defense-in-depth: route-layer schema requires at least one allowlist field, but the
  // service is also reachable from create flows / future internal callers. Refuse to
  // authenticate against an unrestricted config rather than silently allowing any caller.
  if (!allowedAccountIds?.trim() && !allowedPrincipalArns?.trim()) {
    throw new UnauthorizedError({
      message: "Access denied: AWS auth method has no allowlist configured.",
      detail: { reasonCode: "no_allowlist_configured", ...errorContext }
    });
  }

  if (allowedAccountIds) {
    const isAccountAllowed = allowedAccountIds
      .split(",")
      .map((accountId) => accountId.trim())
      .filter((accountId) => accountId.length > 0)
      .some((accountId) => accountId === Account);

    if (!isAccountAllowed) {
      throw new UnauthorizedError({
        message: "Access denied: AWS account ID not allowed.",
        detail: { reasonCode: "account_id_not_allowed", accountId: Account, principalArn: Arn, ...errorContext }
      });
    }
  }

  if (allowedPrincipalArns) {
    const formattedArn = extractPrincipalArn(Arn);

    const isArnAllowed = allowedPrincipalArns
      .split(",")
      .map((principalArn) => principalArn.trim())
      .filter((principalArn) => principalArn.length > 0)
      .some((principalArn) => {
        // Convert wildcard to regex; arnRegex in validators ensures safe input.
        const regex = new RE2(`^${principalArn.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`);
        return regex.test(formattedArn) || regex.test(extractPrincipalArn(Arn, true));
      });

    if (!isArnAllowed) {
      logger.error(
        `Resource AWS Auth Login: AWS principal ARN not allowed [principal-arn=${formattedArn}] [raw-arn=${Arn}] [gateway-id=${errorContext.gatewayId}]`
      );
      throw new UnauthorizedError({
        message: `Access denied: AWS principal ARN not allowed. [principal-arn=${formattedArn}]`,
        detail: {
          reasonCode: "principal_arn_not_allowed",
          accountId: Account,
          principalArn: formattedArn,
          ...errorContext
        }
      });
    }
  }
};
