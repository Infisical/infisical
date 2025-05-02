import { TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { CacheType } from "./super-admin-types";

export type TInvalidateCacheQueueFactoryDep = {
  queueService: TQueueServiceFactory;

  keyStore: Pick<TKeyStoreFactory, "deleteItems" | "setItemWithExpiry" | "deleteItem">;
};

export type TInvalidateCacheQueueFactory = ReturnType<typeof invalidateCacheQueueFactory>;

export const invalidateCacheQueueFactory = ({ queueService, keyStore }: TInvalidateCacheQueueFactoryDep) => {
  const startInvalidate = async (dto: {
    data: {
      type: CacheType;
    };
  }) => {
    // Cancel existing jobs if any
    try {
      console.log("stopping job");
      await queueService.clearQueue(QueueName.InvalidateCache);
    } catch (err) {
      logger.warn(err, "Failed to clear queue");
    }

    await queueService.queue(QueueName.InvalidateCache, QueueJobs.InvalidateCache, dto, {
      removeOnComplete: true,
      removeOnFail: true,
      jobId: "invalidate-cache"
    });
  };

  queueService.start(QueueName.InvalidateCache, async (job) => {
    try {
      const {
        data: { type }
      } = job.data;

      await keyStore.setItemWithExpiry("invalidating-cache", 3600, "true"); // 1 hour max (in case the job somehow silently fails)

      console.log("STARTING JOB");

      if (type === CacheType.ALL || type === CacheType.SECRETS)
        await keyStore.deleteItems({ pattern: "secret-manager:*" });

      // await delay(12000); // TODO(andrey): Remove. It's for debug

      await keyStore.deleteItem("invalidating-cache");
    } catch (err) {
      logger.error(err, "Failed to invalidate cache");
      await keyStore.deleteItem("invalidating-cache");
    }
  });

  return {
    startInvalidate
  };
};
