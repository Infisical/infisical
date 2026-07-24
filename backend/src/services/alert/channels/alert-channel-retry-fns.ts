import { AxiosError } from "axios";

import { REQUEST_RETRY_CONFIG } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { TChannelResult } from "../alert-channel-types";

export const deliverWithRetry = async (
  fn: () => Promise<void>,
  isRetryable: (err: unknown) => boolean,
  ctx: { channelId: string; channelLabel: string }
): Promise<TChannelResult> => {
  const { retries, retryDelay } = REQUEST_RETRY_CONFIG;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const statusCode = (lastError as AxiosError).response?.status;

      if (!isRetryable(lastError)) {
        logger.info(
          { channelId: ctx.channelId, statusCode, error: lastError.message },
          `Alert ${ctx.channelLabel} delivery error is not retryable [channelId=${ctx.channelId}]`
        );
        return { success: false, error: lastError.message };
      }

      const delayMs = attempt < retries ? retryDelay(attempt + 1) : 0;
      logger.info(
        { channelId: ctx.channelId, attempt: attempt + 1, retries, statusCode, error: lastError.message },
        `Alert ${ctx.channelLabel} delivery failed, ${attempt < retries ? `retrying in ${Math.round(delayMs)}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < retries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
