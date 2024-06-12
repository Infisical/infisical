import { BadRequestError } from "@app/lib/errors";

import { TRateLimitDALFactory } from "./rate-limit-dal";
import { TRateLimit, TRateLimitUpdateDTO } from "./rate-limit-types";

type TRateLimitServiceFactoryDep = {
  rateLimitDAL: TRateLimitDALFactory;
};

export type TRateLimitServiceFactory = ReturnType<typeof rateLimitServiceFactory>;

export const rateLimitServiceFactory = ({ rateLimitDAL }: TRateLimitServiceFactoryDep) => {
  const initRateLimits = async (): Promise<TRateLimit> => {
    const rateLimit = await rateLimitDAL.create({});
    return rateLimit;
  };

  const getRateLimits = async (): Promise<TRateLimit> => {
    let rateLimit = (await rateLimitDAL.find({}))[0];
    if (!rateLimit) {
      rateLimit = await initRateLimits();
    }
    return rateLimit;
  };

  const updateRateLimit = async (updates: TRateLimitUpdateDTO): Promise<TRateLimit> => {
    const rateLimit = await rateLimitDAL.findOne({});
    if (!rateLimit) throw new BadRequestError({ name: "Rate Limit Update", message: "Rate Limit does not exist yet" });

    const updateData: Record<string, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      updateData[key] = value;
    }

    const updatedRateLimit = await rateLimitDAL.updateById(rateLimit.id, updateData);
    return updatedRateLimit;
  };

  return {
    initRateLimits,
    getRateLimits,
    updateRateLimit
  };
};
