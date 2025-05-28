import { PushEvent } from "@octokit/webhooks-types";

import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { logger } from "@app/lib/logger";

export const githubSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">
) => {
  const handlePushEvent = async (payload: PushEvent) => {
    const { commits, repository, installation } = payload;

    if (!commits || !repository || !installation) {
      logger.warn(
        `secretScanningV2PushEvent: GitHub - Insufficient data [commits=${commits?.length ?? 0}] [repository=${repository.name}] [installationId=${installation?.id}]`
      );
      return;
    }

    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installation.id)
    });

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: GitHub - Could not find data source [installationId=${installation.id}]`
      );
      return;
    }

    await secretScanningV2Queue.queueResourceDiffScan({
      dataSourceType: SecretScanningDataSource.GitHub,
      payload,
      dataSourceId: dataSource.id
    });
  };

  return {
    handlePushEvent
  };
};
