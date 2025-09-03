/* eslint-disable no-await-in-loop */
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
