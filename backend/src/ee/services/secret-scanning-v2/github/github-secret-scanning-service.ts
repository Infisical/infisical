import { PushEvent } from "@octokit/webhooks-types";

import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { logger } from "@app/lib/logger";

import { TGitHubDataSource } from "./github-secret-scanning-types";

export const githubSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">
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

    const dataSource = (await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installation.id),
      type: SecretScanningDataSource.GitHub
    })) as TGitHubDataSource | undefined;

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: GitHub - Could not find data source [installationId=${installation.id}]`
      );
      return;
    }

    const {
      isAutoScanEnabled,
      config: { includeRepos }
    } = dataSource;

    if (!isAutoScanEnabled) {
      logger.info(
        `secretScanningV2PushEvent: GitHub - ignoring due to auto scan disabled [dataSourceId=${dataSource.id}] [installationId=${installation.id}]`
      );
      return;
    }

    if (includeRepos.includes("*") || includeRepos.includes(repository.full_name)) {
      await secretScanningV2Queue.queueResourceDiffScan({
        dataSourceType: SecretScanningDataSource.GitHub,
        payload,
        dataSourceId: dataSource.id
      });
    } else {
      logger.info(
        `secretScanningV2PushEvent: GitHub - ignoring due to repository not being present in config [installationId=${installation.id}] [dataSourceId=${dataSource.id}]`
      );
    }
  };

  return {
    handlePushEvent,
    handleInstallationDeletedEvent
  };
};
