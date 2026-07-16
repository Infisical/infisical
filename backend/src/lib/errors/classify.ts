import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { isAwsError } from "@app/lib/aws/error";

import {
  BadRequestError,
  CryptographyError,
  DatabaseError,
  ForbiddenRequestError,
  GatewayTimeoutError,
  InternalServerError,
  NotFoundError,
  OidcAuthError,
  PermissionBoundaryError,
  PolicyViolationError,
  RateLimitError,
  ScimRequestError,
  UnauthorizedError
} from "./index";

// Closed enum of error categories used as the `error.type` metric label across the API error counter,
// queue job failure counter, audit log stream delivery counter, and any other metric that needs to
// classify a thrown error. Keep cardinality bounded, never echo error messages back as labels.
export const ERROR_TYPES = [
  "validation",
  "auth",
  "permission",
  "not_found",
  "rate_limit",
  "db",
  "timeout",
  "network",
  "cryptography",
  "policy",
  "scim",
  "oidc",
  "internal",
  "unknown"
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

// Duck-typed Axios error detection, avoids pulling axios as a hard dep here.
const isAxiosLikeError = (err: unknown): err is { code?: string; response?: { status?: number } } =>
  typeof err === "object" &&
  err !== null &&
  // axios sets isAxiosError = true on the error instance, and always attaches a response on HTTP errors
  (("isAxiosError" in err && (err as { isAxiosError?: boolean }).isAxiosError === true) || "response" in err);

// Connection-level error codes that unambiguously mean timeout/network regardless of whether the error
// originated from axios or a raw Node socket. Pulled out so they're classified before the axios check.
const getErrorCode = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "code" in err && typeof (err as { code?: unknown }).code === "string"
    ? (err as { code: string }).code
    : undefined;

/**
 * Classify a thrown error into one of the bounded ERROR_TYPES values. Used for the `error.type` label
 * on metrics. Falls back to "unknown" when nothing matches, never throws.
 */
export const classifyError = (err: unknown): ErrorType => {
  if (err instanceof jwt.JsonWebTokenError) return "auth";
  if (err instanceof UnauthorizedError) return "auth";
  if (err instanceof ForbiddenError || err instanceof ForbiddenRequestError || err instanceof PermissionBoundaryError)
    return "permission";
  if (err instanceof RateLimitError) return "rate_limit";
  if (err instanceof NotFoundError) return "not_found";
  if (err instanceof BadRequestError) return "validation";
  if (err instanceof DatabaseError) return "db";
  if (err instanceof GatewayTimeoutError) return "timeout";
  if (err instanceof CryptographyError) return "cryptography";
  if (err instanceof PolicyViolationError) return "policy";
  if (err instanceof ScimRequestError) return "scim";
  if (err instanceof OidcAuthError) return "oidc";
  if (err instanceof InternalServerError) return "internal";

  if (isAwsError(err, "ThrottlingException")) return "rate_limit";

  const code = getErrorCode(err);
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return "timeout";
  if (code === "ECONNRESET" || code === "ENOTFOUND" || code === "ECONNREFUSED") return "network";

  if (isAxiosLikeError(err)) {
    const status = err.response?.status;
    if (status === 429) return "rate_limit";
    if (status === 401 || status === 403) return "auth";
    if (status === 404) return "not_found";
    if (status && status >= 400 && status < 500) return "validation";
    return "network";
  }

  if (err instanceof Error) {
    const msg = err.message?.toLowerCase() ?? "";
    if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
    if (msg.includes("connect") || msg.includes("network")) return "network";
  }

  return "unknown";
};
