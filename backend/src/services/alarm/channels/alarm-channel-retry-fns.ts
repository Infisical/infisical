import { AxiosError } from "axios";

import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import { TChannelResult } from "../alarm-channel-types";

export const retryWithBackoff = async (
  fn: () => Promise<void>,
  isRetryable: (err: unknown) => boolean,
  ctx: { channelId: string; channelLabel: string }
): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = ALARM_CHANNEL_RETRY_CONFIG;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
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
          `Alarm ${ctx.channelLabel} delivery error is not retryable [channelId=${ctx.channelId}]`
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        { channelId: ctx.channelId, attempt, maxRetries, statusCode, error: lastError.message },
        `Alarm ${ctx.channelLabel} delivery failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};

export const isAxiosErrorRetryable = (err: unknown): boolean => {
  const axiosErr = err as AxiosError;
  const status = axiosErr.response?.status;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  if (axiosErr.code && RETRYABLE_NETWORK_ERRORS.includes(axiosErr.code)) return true;
  if (axiosErr.message?.toLowerCase().includes("timeout")) return true;
  return false;
};
