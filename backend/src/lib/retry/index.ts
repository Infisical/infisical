/* eslint-disable no-await-in-loop */
import { HttpStatusCode, isAxiosError } from "axios";

interface GitHubApiError extends Error {
  status?: number;
  response?: {
    status?: number;
    headers?: {
      "x-ratelimit-reset"?: string;
    };
  };
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });

export const retryWithBackoff = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const gitHubError = error as GitHubApiError;
      const statusCode = gitHubError.status || gitHubError.response?.status;
      if (statusCode === 403) {
        const rateLimitReset = gitHubError.response?.headers?.["x-ratelimit-reset"];
        if (rateLimitReset) {
          const resetTime = parseInt(rateLimitReset, 10) * 1000;
          const waitTime = Math.max(resetTime - Date.now(), baseDelay);
          await delay(Math.min(waitTime, 60000));
        } else {
          await delay(baseDelay * 2 ** attempt);
        }
      } else if (attempt < maxRetries) {
        await delay(baseDelay * 2 ** attempt);
      }
    }
  }

  throw lastError!;
};

/**
 * Retries `fn` while the upstream answers 429, backing off exponentially.
 *
 * Deliberately narrower than `retryWithBackoff` above, which retries on any thrown error. Callers
 * that turn 4xx responses into actionable messages (a rejected credential, a name collision) need
 * those to surface on the first attempt rather than after several pointless round trips.
 */
export const retryOnRateLimit = async <T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelay = 500 }: { maxRetries?: number; baseDelay?: number } = {}
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimited = isAxiosError(error) && error.response?.status === HttpStatusCode.TooManyRequests;
      if (!isRateLimited || attempt >= maxRetries) throw error;
      await delay(baseDelay * 2 ** attempt);
    }
  }
};
