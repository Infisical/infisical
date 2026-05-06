/* eslint-disable max-classes-per-file */
import RE2 from "re2";

import { logger } from "@app/lib/logger";

export const ACME_ORDER_TIMEOUT_MS = 5 * 60 * 1000;

export class AcmeOrderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmeOrderTimeoutError";
  }
}

export class AcmeRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcmeRateLimitError";
  }
}

const ACME_ERROR_URN_PREFIX = "urn:ietf:params:acme:error:";

const RATE_LIMIT_URN = `${ACME_ERROR_URN_PREFIX}rateLimited`;

const RATE_LIMITED_WORD_RE = new RE2("\\brateLimited\\b", "i");

export const isAcmeRateLimitError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes(RATE_LIMIT_URN) || RATE_LIMITED_WORD_RE.test(error.message);
};

const formatTimeoutDuration = (timeoutMs: number): string => {
  const totalSeconds = Math.round(timeoutMs / 1000);
  if (totalSeconds % 60 === 0) {
    const minutes = totalSeconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${totalSeconds} seconds`;
};

export const runWithAcmeOrderTimeout = async <T>(
  operationFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  const duration = formatTimeoutDuration(timeoutMs);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(
        new AcmeOrderTimeoutError(
          `ACME order did not complete within ${duration}. Possible causes: the CA is rate-limiting requests, the order is blocked at validation, or the CA is slow to respond.`
        )
      );
    }, timeoutMs);
  });

  const operationPromise = operationFactory(controller.signal);
  operationPromise.catch((err: unknown) => {
    if (controller.signal.aborted) {
      logger.debug({ err }, "ACME order operation rejected after timeout");
    }
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export const throwIfAcmeOrderAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new Error("ACME order aborted after timeout");
  }
};
