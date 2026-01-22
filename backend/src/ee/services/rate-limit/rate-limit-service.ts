import { CronJob } from "cron";

import { logger } from "@app/lib/logger";

import { TLicenseServiceFactory } from "../license/license-service";
import { TRateLimitDALFactory } from "./rate-limit-dal";
import { RateLimitConfiguration, TRateLimit, TRateLimitServiceFactory } from "./rate-limit-types";

let rateLimitMaxConfiguration: RateLimitConfiguration = {
  readLimit: 60,
  publicEndpointLimit: 30,
  writeLimit: 200,
  secretsLimit: 60,
  authRateLimit: 60,
  inviteUserRateLimit: 30,
  mfaRateLimit: 20,
  identityCreationLimit: 30,
  projectCreationLimit: 30
};

Object.freeze(rateLimitMaxConfiguration);

export const getRateLimiterConfig = () => {
  return rateLimitMaxConfiguration;
};

type TRateLimitServiceFactoryDep = {
  rateLimitDAL: TRateLimitDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures">;
};

export const rateLimitServiceFactory = ({
  rateLimitDAL,
  licenseService
}: TRateLimitServiceFactoryDep): TRateLimitServiceFactory => {
  const DEFAULT_RATE_LIMIT_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

  const getRateLimits: TRateLimitServiceFactory["getRateLimits"] = async () => {
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
      logger.error(err, "Error fetching rate limits");
      return undefined;
    }
  };

  const updateRateLimit: TRateLimitServiceFactory["updateRateLimit"] = async (updates) => {
    return rateLimitDAL.updateById(DEFAULT_RATE_LIMIT_CONFIG_ID, updates);
  };

  const syncRateLimitConfiguration: TRateLimitServiceFactory["syncRateLimitConfiguration"] = async () => {
    try {
      const rateLimit = await getRateLimits();
      if (rateLimit) {
        const newRateLimitMaxConfiguration: typeof rateLimitMaxConfiguration = {
          readLimit: rateLimit.readRateLimit,
          publicEndpointLimit: rateLimit.publicEndpointLimit,
          writeLimit: rateLimit.writeRateLimit,
          secretsLimit: rateLimit.secretsRateLimit,
          authRateLimit: rateLimit.authRateLimit,
          inviteUserRateLimit: rateLimit.inviteUserRateLimit,
          mfaRateLimit: rateLimit.mfaRateLimit
        };

        logger.info(newRateLimitMaxConfiguration, "syncRateLimitConfiguration: rate limit configuration");
        Object.freeze(newRateLimitMaxConfiguration);
        rateLimitMaxConfiguration = newRateLimitMaxConfiguration;
      }
    } catch (error) {
      logger.error(error, "Error syncing rate limit configurations");
    }
  };

  const initializeBackgroundSync: TRateLimitServiceFactory["initializeBackgroundSync"] = async () => {
    if (!licenseService.onPremFeatures.customRateLimits) {
      logger.info("Current license does not support custom rate limit configuration");
      return;
    }

    logger.info("Setting up background sync process for rate limits");
    // initial sync upon startup
    await syncRateLimitConfiguration();

    // sync rate limits configuration every 10 minutes
    const job = new CronJob("*/10 * * * *", syncRateLimitConfiguration);
    job.start();

    return job;
  };

  return {
    getRateLimits,
    updateRateLimit,
    initializeBackgroundSync,
    syncRateLimitConfiguration
  };
};
