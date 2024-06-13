import { BadRequestError } from "@app/lib/errors";

import { TRateLimitDALFactory } from "./rate-limit-dal";
import { TRateLimit, TRateLimitUpdateDTO } from "./rate-limit-types";

type TRateLimitServiceFactoryDep = {
  rateLimitDAL: TRateLimitDALFactory;
};

export type TRateLimitServiceFactory = ReturnType<typeof rateLimitServiceFactory>;

export const rateLimitServiceFactory = ({ rateLimitDAL }: TRateLimitServiceFactoryDep) => {
  const getRateLimits = async (): Promise<TRateLimit> => {
    return rateLimitDAL.findOne({ id: "00000000-0000-0000-0000-000000000000" });
  };

  const updateRateLimit = async (updates: TRateLimitUpdateDTO): Promise<TRateLimit> => {
    const rateLimit = await rateLimitDAL.findOne({
      id: "00000000-0000-0000-0000-000000000000"
    });

    if (!rateLimit) {
      throw new BadRequestError({ name: "Rate Limit Update", message: "Rate Limit does not exist yet" });
    }

    return rateLimitDAL.updateById(rateLimit.id, updates);
  };

  return {
    getRateLimits,
    updateRateLimit
  };
};
