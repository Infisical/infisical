import { CronJob } from "cron";

import { logger } from "@app/lib/logger";
import { rateLimitMaxConfiguration } from "@app/server/config/rateLimiter";

import { TRateLimitDALFactory } from "./rate-limit-dal";
import { TRateLimit, TRateLimitUpdateDTO } from "./rate-limit-types";

type TRateLimitServiceFactoryDep = {
  rateLimitDAL: TRateLimitDALFactory;
};

export type TRateLimitServiceFactory = ReturnType<typeof rateLimitServiceFactory>;

export const rateLimitServiceFactory = ({ rateLimitDAL }: TRateLimitServiceFactoryDep) => {
  const DEFAULT_RATE_LIMIT_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

  const getRateLimits = async (): Promise<TRateLimit | undefined> => {
    let rateLimit: TRateLimit;

    try {
      rateLimit = await rateLimitDAL.findOne({ id: DEFAULT_RATE_LIMIT_CONFIG_ID });
      if (!rateLimit) {
        // rate limit might not exist
        rateLimit = await rateLimitDAL.create({
          // @ts-expect-error id is kept as fixed because there should only be one rate limit config per instance
          id: DEFAULT_RATE_LIMIT_CONFIG_ID
        });
      }
      return rateLimit;
    } catch (err) {
      return undefined;
    }
  };

  const updateRateLimit = async (updates: TRateLimitUpdateDTO): Promise<TRateLimit> => {
    return rateLimitDAL.updateById(DEFAULT_RATE_LIMIT_CONFIG_ID, updates);
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
