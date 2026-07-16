import { AxiosError } from "axios";

import {
  BadRequestError,
  CryptographyError,
  DatabaseError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  RateLimitError
} from "@app/lib/errors";

const MAX_REASON_LEN = 1000;

const KNOWN_USELESS_DEFAULTS = new Set([
  "Failed to execute db ops",
  "Something went wrong",
  "Unknown error",
  "Error",
  "Request failed with status code 400",
  "Request failed with status code 500"
]);

const isEmptyish = (s: string | undefined | null): boolean => {
  if (!s) return true;
  const trimmed = s.trim();
  if (!trimmed) return true;
  if (KNOWN_USELESS_DEFAULTS.has(trimmed)) return true;
  return false;
};

const truncate = (s: string): string => {
  const normalized = s.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_REASON_LEN) return normalized;
  return `${normalized.slice(0, MAX_REASON_LEN - 1)}…`;
};

type TAxiosErrorBody = {
  type?: string;
  detail?: string;
  errors?: { code?: string | number; message?: string; detail?: string }[];
  error?: { message?: string; detail?: string } | string;
  message?: string;
};

const formatAxiosError = (err: AxiosError): string | null => {
  const status = err.response?.status;
  const statusText = err.response?.statusText;
  const body = err.response?.data as TAxiosErrorBody | string | undefined;

  let detail: string | undefined;
  if (typeof body === "string") {
    detail = body;
  } else if (body) {
    detail =
      body.detail ??
      body.errors?.[0]?.message ??
      body.errors?.[0]?.detail ??
      (typeof body.error === "string" ? body.error : (body.error?.detail ?? body.error?.message)) ??
      body.message;
    if (!detail && body.type) detail = body.type;
  }

  if (!detail && !isEmptyish(err.message)) detail = err.message;

  const prefix = status ? `HTTP ${status}${statusText ? ` ${statusText}` : ""}` : null;
  if (detail && prefix) return `${prefix} — ${detail}`;
  if (detail) return detail;
  if (prefix) return prefix;
  return null;
};

const collectMessageChain = (err: unknown): string | null => {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof AxiosError) {
      const formatted = formatAxiosError(current);
      if (formatted) parts.push(formatted);
    } else if (current instanceof Error) {
      if (!isEmptyish(current.message)) {
        parts.push(current.message);
      } else if (!isEmptyish(current.name) && current.name !== "Error") {
        parts.push(current.name);
      }
    } else {
      const stringified = String(current);
      if (!isEmptyish(stringified)) parts.push(stringified);
    }
    current = (current as { cause?: unknown } | null | undefined)?.cause;
  }

  if (parts.length === 0) return null;
  const deduped: string[] = [];
  for (const p of parts) {
    if (!deduped.includes(p)) deduped.push(p);
  }
  return deduped.join(" — ");
};

export const isTerminalIssuanceError = (err: unknown): boolean => {
  if (err == null) return false;

  if (
    err instanceof BadRequestError ||
    err instanceof NotFoundError ||
    err instanceof ForbiddenRequestError ||
    err instanceof CryptographyError
  ) {
    return true;
  }

  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return true;
    }
    // No HTTP response
    return false;
  }

  if (err instanceof Error && err.message) {
    const msg = err.message;
    const TERMINAL_PHRASES = [
      "exceeds the maximum",
      "InvalidArgsException",
      "InvalidArnException",
      "MalformedCSRException",
      "LimitExceededException",
      "ValidationException",
      "AccessDeniedException",
      "ResourceNotFoundException",
      "the requested certificate validity exceeds",
      "Invalid CSR",
      "Malformed",
      "is not supported"
    ];
    if (TERMINAL_PHRASES.some((p) => msg.includes(p))) return true;
  }

  return false;
};

export const formatSignerIssuanceErrorReason = (err: unknown, fallbackContext?: string): string => {
  const fallback = fallbackContext
    ? `${fallbackContext}. Check audit logs for the full error.`
    : "Issuance failed. Check audit logs for the full error.";

  if (err == null) return truncate(fallback);

  if (
    err instanceof BadRequestError ||
    err instanceof NotFoundError ||
    err instanceof ForbiddenRequestError ||
    err instanceof RateLimitError ||
    err instanceof CryptographyError
  ) {
    return truncate(err.message);
  }

  if (err instanceof DatabaseError) {
    const cause = collectMessageChain((err as DatabaseError & { error?: unknown }).error);
    if (cause) {
      return truncate(`Internal database error: ${cause}`);
    }
    return truncate(
      "An internal database error occurred while issuing the certificate. Retry the operation; if it persists, contact support."
    );
  }
  if (err instanceof InternalServerError) {
    const chain = collectMessageChain(err);
    if (chain) return truncate(`Internal error: ${chain}`);
    return truncate("An internal error occurred while issuing the certificate. Check audit logs for details.");
  }

  const chain = collectMessageChain(err);
  if (chain) return truncate(chain);

  if (err instanceof Error && !isEmptyish(err.name) && err.name !== "Error") {
    return truncate(`${fallback} (${err.name})`);
  }
  return truncate(fallback);
};
