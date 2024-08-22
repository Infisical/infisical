import { z } from "zod";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { applyJitter, secondsToMillis } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TServiceTokenDALFactory } from "../service-token/service-token-dal";

type TAccessTokenQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "updateById">;
  serviceTokenDAL: Pick<TServiceTokenDALFactory, "updateById">;
};

export type TAccessTokenQueueServiceFactory = ReturnType<typeof accessTokenQueueServiceFactory>;

export const AccessTokenStatusSchema = z.object({
  lastUpdatedAt: z.string().datetime(),
  numberOfUses: z.number()
});

export const accessTokenQueueServiceFactory = ({
  queueService,
  keyStore,
  identityAccessTokenDAL,
  serviceTokenDAL
}: TAccessTokenQueueServiceFactoryDep) => {
  const getIdentityTokenDetailsInCache = async (identityAccessTokenId: string) => {
    const tokenDetailsInCache = await keyStore.getItem(
      KeyStorePrefixes.IdentityAccessTokenStatusUpdate(identityAccessTokenId)
    );
    if (tokenDetailsInCache) {
      return AccessTokenStatusSchema.parseAsync(JSON.parse(tokenDetailsInCache));
    }
  };

  const updateServiceTokenStatus = async (serviceTokenId: string) => {
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.ServiceTokenStatusUpdate(serviceTokenId),
      KeyStoreTtls.AccessTokenStatusUpdateInSeconds,
      JSON.stringify({ lastUpdatedAt: new Date() })
    );
    await queueService.queue(
      QueueName.AccessTokenStatusUpdate,
      QueueJobs.ServiceTokenStatusUpdate,
      {
        serviceTokenId
      },
      {
        delay: applyJitter(secondsToMillis(KeyStoreTtls.AccessTokenStatusUpdateInSeconds / 2), secondsToMillis(10)),
        // https://docs.bullmq.io/guide/jobs/job-ids
        jobId: KeyStorePrefixes.ServiceTokenStatusUpdate(serviceTokenId).replaceAll(":", "_"),
        removeOnFail: true,
        removeOnComplete: true
      }
    );
  };

  const updateIdentityAccessTokenStatus = async (identityAccessTokenId: string, numberOfUses: number) => {
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.IdentityAccessTokenStatusUpdate(identityAccessTokenId),
      KeyStoreTtls.AccessTokenStatusUpdateInSeconds,
      JSON.stringify({ lastUpdatedAt: new Date(), numberOfUses })
    );
    await queueService.queue(
      QueueName.AccessTokenStatusUpdate,
      QueueJobs.IdentityAccessTokenStatusUpdate,
      {
        identityAccessTokenId,
        numberOfUses
      },
      {
        delay: applyJitter(secondsToMillis(KeyStoreTtls.AccessTokenStatusUpdateInSeconds / 2), secondsToMillis(10)),
        jobId: KeyStorePrefixes.IdentityAccessTokenStatusUpdate(identityAccessTokenId).replaceAll(":", "_"),
        removeOnFail: true,
        removeOnComplete: true
      }
    );
  };

  queueService.start(QueueName.AccessTokenStatusUpdate, async (job) => {
    // for identity token update
    if (job.name === QueueJobs.IdentityAccessTokenStatusUpdate && "identityAccessTokenId" in job.data) {
      const { identityAccessTokenId } = job.data;
      const tokenDetails = { lastUpdatedAt: new Date(job.timestamp), numberOfUses: job.data.numberOfUses };
      const tokenDetailsInCache = await getIdentityTokenDetailsInCache(identityAccessTokenId);
      if (tokenDetailsInCache) {
        tokenDetails.numberOfUses = tokenDetailsInCache.numberOfUses;
        tokenDetails.lastUpdatedAt = new Date(tokenDetailsInCache.lastUpdatedAt);
      }

      await identityAccessTokenDAL.updateById(identityAccessTokenId, {
        accessTokenLastUsedAt: tokenDetails.lastUpdatedAt,
        accessTokenNumUses: tokenDetails.numberOfUses
      });
      return;
    }

    // for service token
    if (job.name === QueueJobs.ServiceTokenStatusUpdate && "serviceTokenId" in job.data) {
      const { serviceTokenId } = job.data;
      const tokenDetailsInCache = await keyStore.getItem(KeyStorePrefixes.ServiceTokenStatusUpdate(serviceTokenId));
      let lastUsed = new Date(job.timestamp);
      if (tokenDetailsInCache) {
        const tokenDetails = await AccessTokenStatusSchema.pick({ lastUpdatedAt: true }).parseAsync(
          JSON.parse(tokenDetailsInCache)
        );
        lastUsed = new Date(tokenDetails.lastUpdatedAt);
      }

      await serviceTokenDAL.updateById(serviceTokenId, {
        lastUsed
      });
    }
  });

  queueService.listen(QueueName.AccessTokenStatusUpdate, "failed", (_, err) => {
    logger.error(err, `${QueueName.AccessTokenStatusUpdate}: Failed to updated access token status`);
  });

  return { updateIdentityAccessTokenStatus, updateServiceTokenStatus, getIdentityTokenDetailsInCache };
};
