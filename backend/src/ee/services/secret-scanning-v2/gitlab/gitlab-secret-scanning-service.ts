import { GitLabDataSourceScope } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-enums";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import {
  TGitLabDataSource,
  TGitLabDataSourceCredentials,
  THandleGitLabPushEvent
} from "./gitlab-secret-scanning-types";

export const gitlabSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const handlePushEvent = async ({ payload, token, dataSourceId }: THandleGitLabPushEvent) => {
    if (!payload.total_commits_count || !payload.project) {
      logger.warn(
        `secretScanningV2PushEvent: GitLab - Insufficient data [changes=${
          payload.total_commits_count ?? 0
        }] [projectName=${payload.project?.path_with_namespace ?? "unknown"}] [projectId=${payload.project?.id ?? "unknown"}]`
      );
      return;
    }

    const dataSource = (await secretScanningV2DAL.dataSources.findOne({
      id: dataSourceId,
      type: SecretScanningDataSource.GitLab
    })) as TGitLabDataSource | undefined;

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: GitLab - Could not find data source [dataSourceId=${dataSourceId}] [projectId=${payload.project.id}]`
      );
      return;
    }

    const { isAutoScanEnabled, config, encryptedCredentials, projectId } = dataSource;

    if (!encryptedCredentials) {
      logger.info(
        `secretScanningV2PushEvent: GitLab - Could not find encrypted credentials [dataSourceId=${dataSource.id}] [projectId=${payload.project.id}]`
      );
      return;
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedCredentials = decryptor({ cipherTextBlob: encryptedCredentials });

    const credentials = JSON.parse(decryptedCredentials.toString()) as TGitLabDataSourceCredentials;

    if (token !== credentials.token) {
      logger.error(
        `secretScanningV2PushEvent: GitLab - Invalid webhook token [dataSourceId=${dataSource.id}] [projectId=${payload.project.id}]`
      );
      return;
    }

    if (!isAutoScanEnabled) {
      logger.info(
        `secretScanningV2PushEvent: GitLab - ignoring due to auto scan disabled [dataSourceId=${dataSource.id}] [projectId=${payload.project.id}]`
      );
      return;
    }

    if (
      config.scope === GitLabDataSourceScope.Project
        ? config.projectId.toString() === payload.project_id.toString()
        : config.includeProjects.includes("*") || config.includeProjects.includes(payload.project.path_with_namespace)
    ) {
      await secretScanningV2Queue.queueResourceDiffScan({
        dataSourceType: SecretScanningDataSource.GitLab,
        payload,
        dataSourceId: dataSource.id
      });
    } else {
      logger.info(
        `secretScanningV2PushEvent: GitLab - ignoring due to repository not being present in config [dataSourceId=${dataSource.id}] [projectId=${payload.project.id}]`
      );
    }
  };

  return {
    handlePushEvent
  };
};
