import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { CacheType } from "./super-admin-types";

export type TInvalidateCacheQueueFactoryDep = {
  queueService: TQueueServiceFactory;

  keyStore: Pick<TKeyStoreFactory, "deleteItems">;
};

export type TInvalidateCacheQueueFactory = ReturnType<typeof invalidateCacheQueueFactory>;

export const invalidateCacheQueueFactory = ({ queueService, keyStore }: TInvalidateCacheQueueFactoryDep) => {
  const startInvalidate = async (dto: {
    data: {
      type: CacheType;
    };
  }) => {
    await queueService.queue(QueueName.InvalidateCache, QueueJobs.InvalidateCache, dto, {
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  queueService.start(QueueName.InvalidateCache, async (job) => {
    try {
      const {
        data: { type }
      } = job.data;

      if (type === CacheType.ALL || type === CacheType.SECRETS)
        await keyStore.deleteItems({ pattern: "secret-manager:*" });
    } catch (err) {
      logger.error(err, "Failed to invalidate cache");
    }
  });

  return {
    startInvalidate
  };
};
