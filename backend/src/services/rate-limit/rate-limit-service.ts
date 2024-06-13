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
    return rateLimitDAL.updateById("00000000-0000-0000-0000-000000000000", updates);
  };

  return {
    getRateLimits,
    updateRateLimit
  };
};
