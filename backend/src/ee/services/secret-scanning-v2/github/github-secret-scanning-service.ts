import { PushEvent } from "@octokit/webhooks-types";

import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { logger } from "@app/lib/logger";

export const githubSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "handleResourcePushEvent">
) => {
  const handleInstallationDeletedEvent = async (installationId: number) => {
    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installationId),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(
        `secretScanningV2RemoveEvent: GitHub - Could not find data source [installationId=${installationId}]`
      );
      return;
    }

    logger.info(
      `secretScanningV2RemoveEvent: GitHub - installation deleted [installationId=${installationId}] [dataSourceId=${dataSource.id}]`
    );

    await secretScanningV2DAL.dataSources.updateById(dataSource.id, {
      isDisconnected: true
    });
  };

  const handlePushEvent = async (payload: PushEvent) => {
    const { commits, repository, installation } = payload;

    if (!commits || !repository || !installation) {
      logger.warn(
        `secretScanningV2PushEvent: GitHub - Insufficient data [commits=${commits?.length ?? 0}] [repository=${repository.name}] [installationId=${installation?.id}]`
      );
      return;
    }

    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installation.id),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: GitHub - Could not find data source [installationId=${installation.id}]`
      );
      return;
    }

    await secretScanningV2Queue.handleResourcePushEvent({
      dataSource,
      dataSourceType: SecretScanningDataSource.GitHub,
      payload
    });
  };

  return {
    handlePushEvent,
    handleInstallationDeletedEvent
  };
};
