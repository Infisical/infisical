import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  extractPrincipalArn,
  parseSignedGetCallerIdentityRequest
} from "@app/services/identity-aws-auth/identity-aws-auth-fns";

import { TGetCallerIdentityResponse } from "./aws-auth-types";

type TVerifyStsCallerInput = {
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
  errorContext: Record<string, unknown>;
};

/**
 * Verifies a signed STS GetCallerIdentity request and returns the caller's account/ARN/userId.
 * Throws UnauthorizedError on failure with errorContext attached so callers can audit-log it.
 */
export const verifyStsAndExtractCaller = async ({
  iamHttpRequestMethod,
  iamRequestBody,
  iamRequestHeaders,
  errorContext
}: TVerifyStsCallerInput) => {
  let signedRequest: ReturnType<typeof parseSignedGetCallerIdentityRequest>;
  try {
    signedRequest = parseSignedGetCallerIdentityRequest({ iamHttpRequestMethod, iamRequestBody, iamRequestHeaders });
  } catch (err) {
    throw new UnauthorizedError({
      message: err instanceof BadRequestError ? err.message : "Malformed signed STS request",
      detail: { reasonCode: "malformed_request", ...errorContext }
    });
  }
  const { url, headers, body } = signedRequest;

  let stsResponse: { data: TGetCallerIdentityResponse };
  try {
    stsResponse = await request({
      method: "POST",
      url,
      headers,
      data: body
    });
  } catch (err) {
    logger.error(
      err,
      `Resource AWS Auth Login: STS verification failed [resourceId=${String(errorContext.resourceId)}]`
    );
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
  errorContext: Record<string, unknown>;
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
      logger.warn(
        `Resource AWS Auth Login: AWS principal ARN not allowed [principal-arn=${formattedArn}] [raw-arn=${Arn}] [resourceId=${String(errorContext.resourceId)}]`
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
