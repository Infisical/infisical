/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { logger } from "@app/lib/logger";

export type RateLimitConfig = {
  MAX_CONCURRENT_REQUESTS: number;
  BASE_DELAY: number;
  MAX_DELAY: number;
  MAX_RETRIES: number;
  RATE_LIMIT_STATUS_CODES: number[];
};

export type RateLimitContext = {
  operation: string;
  identifier?: string;
  syncId: string;
};

export type ConcurrencyContext = {
  operation: string;
  syncId: string;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const createRateLimitErrorChecker =
  (config: RateLimitConfig) =>
  (error: unknown): boolean => {
    if (error instanceof AxiosError) {
      return (
        config.RATE_LIMIT_STATUS_CODES.includes(error.response?.status || 0) ||
        error.message.toLowerCase().includes("rate limit") ||
        error.message.toLowerCase().includes("throttl")
      );
    }
    return false;
  };

export const createRateLimitRetry =
  (config: RateLimitConfig, isRateLimitError: (error: unknown) => boolean) =>
  async <T>(fn: () => Promise<T>, context: RateLimitContext, retryCount = 0): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error) && retryCount < config.MAX_RETRIES) {
        const delay = Math.min(config.BASE_DELAY * 2 ** retryCount, config.MAX_DELAY);

        logger.warn(
          {
            syncId: context.syncId,
            operation: context.operation,
            identifier: context.identifier,
            retryCount: retryCount + 1,
            delayMs: delay,
            error: error instanceof AxiosError ? error.message : String(error)
          },
          "Rate limit hit, retrying with exponential backoff"
        );

        await sleep(delay);
        return createRateLimitRetry(config, isRateLimitError)(fn, context, retryCount + 1);
      }

      throw error;
    }
  };

export const createConcurrencyLimitExecutor =
  (
    config: RateLimitConfig,
    withRateLimitRetry: <T>(fn: () => Promise<T>, context: RateLimitContext, retryCount?: number) => Promise<T>
  ) =>
  async <T, R>(
    items: T[],
    executor: (item: T) => Promise<R>,
    context: ConcurrencyContext,
    concurrencyLimit = config.MAX_CONCURRENT_REQUESTS
  ): Promise<PromiseSettledResult<R>[]> => {
    const results: PromiseSettledResult<R>[] = [];

    for (let i = 0; i < items.length; i += concurrencyLimit) {
      const batch = items.slice(i, i + concurrencyLimit);

      logger.debug(
        {
          syncId: context.syncId,
          operation: context.operation,
          batchStart: i + 1,
          batchEnd: Math.min(i + concurrencyLimit, items.length),
          totalItems: items.length
        },
        "Processing batch with rate limit protection"
      );

      const batchPromises = batch.map((item, batchIndex) =>
        withRateLimitRetry(() => executor(item), {
          operation: context.operation,
          identifier: `batch-${i + batchIndex + 1}`,
          syncId: context.syncId
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      if (i + concurrencyLimit < items.length) {
        await sleep(100);
      }
    }

    return results;
  };

export const createConnectionQueue = (config: RateLimitConfig) => {
  const isRateLimitError = createRateLimitErrorChecker(config);
  const withRateLimitRetry = createRateLimitRetry(config, isRateLimitError);
  const executeWithConcurrencyLimit = createConcurrencyLimitExecutor(config, withRateLimitRetry);

  return {
    sleep,
    isRateLimitError,
    withRateLimitRetry,
    executeWithConcurrencyLimit
  };
};
