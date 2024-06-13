import { CronJob } from "cron";

import { getConfig } from "@app/lib/config/env";
import { ForbiddenRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { rateLimitMaxConfiguration } from "@app/server/config/rateLimiter";

import { TRateLimitDALFactory } from "./rate-limit-dal";
import { TRateLimit, TRateLimitUpdateDTO } from "./rate-limit-types";

type TRateLimitServiceFactoryDep = {
  rateLimitDAL: TRateLimitDALFactory;
};

export type TRateLimitServiceFactory = ReturnType<typeof rateLimitServiceFactory>;

export const rateLimitServiceFactory = ({ rateLimitDAL }: TRateLimitServiceFactoryDep) => {
  const getRateLimits = async (): Promise<TRateLimit | undefined> => {
    try {
      return await rateLimitDAL.findOne({ id: "00000000-0000-0000-0000-000000000000" });
    } catch (error) {
      return undefined;
    }
  };

  const updateRateLimit = async (updates: TRateLimitUpdateDTO): Promise<TRateLimit> => {
    const appCfg = getConfig();
    if (!appCfg.ALLOW_RATELIMIT_UPDATES) {
      throw new ForbiddenRequestError({
        name: "Rate limit Updates Disabled",
        message: "Changes to rate limits are disabled"
      });
    }
    return rateLimitDAL.updateById("00000000-0000-0000-0000-000000000000", updates);
  };

  const initializeBackgroundSync = () => {
    const rateLimitSync = async () => {
      try {
        const rateLimit = await getRateLimits();
        if (rateLimit) {
          rateLimitMaxConfiguration.readLimit = rateLimit.readRateLimit;
          rateLimitMaxConfiguration.publicEndpointLimit = rateLimit.publicEndpointLimit;
          rateLimitMaxConfiguration.writeLimit = rateLimit.writeRateLimit;
          rateLimitMaxConfiguration.secretsLimit = rateLimit.secretsRateLimit;
          rateLimitMaxConfiguration.authRateLimit = rateLimit.authRateLimit;
          rateLimitMaxConfiguration.inviteUserRateLimit = rateLimit.inviteUserRateLimit;
          rateLimitMaxConfiguration.mfaRateLimit = rateLimit.mfaRateLimit;
          rateLimitMaxConfiguration.creationLimit = rateLimit.creationLimit;
        }
      } catch (error) {
        logger.error(`Error syncing rate limit configurations: %o`, error);
      }
    };

    // sync rate limits configuration every 10 minutes
    const job = new CronJob("*/10 * * * *", rateLimitSync);
    job.start();

    return job;
  };

  return {
    getRateLimits,
    updateRateLimit,
    initializeBackgroundSync
  };
};
