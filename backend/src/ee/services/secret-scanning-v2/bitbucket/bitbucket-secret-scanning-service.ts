import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import {
  TBitbucketDataSource,
  TBitbucketDataSourceCredentials,
  TBitbucketPushEvent
} from "./bitbucket-secret-scanning-types";

export const bitbucketSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "queueResourceDiffScan">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const handlePushEvent = async (
    payload: TBitbucketPushEvent & { dataSourceId: string; receivedSignature: string; bodyString: string }
  ) => {
    const { push, repository, bodyString, receivedSignature } = payload;

    if (!push?.changes?.length || !repository?.workspace?.uuid) {
      logger.warn(
        `secretScanningV2PushEvent: Bitbucket - Insufficient data [changes=${
          push?.changes?.length ?? 0
        }] [repository=${repository?.name}] [workspaceUuid=${repository?.workspace?.uuid}]`
      );
      return;
    }

    const dataSource = (await secretScanningV2DAL.dataSources.findOne({
      id: payload.dataSourceId,
      type: SecretScanningDataSource.Bitbucket
    })) as TBitbucketDataSource | undefined;

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: Bitbucket - Could not find data source [workspaceUuid=${repository.workspace.uuid}]`
      );
      return;
    }

    const {
      isAutoScanEnabled,
      config: { includeRepos },
      encryptedCredentials,
      projectId
    } = dataSource;

    if (!encryptedCredentials) {
      logger.info(
        `secretScanningV2PushEvent: Bitbucket - Could not find encrypted credentials [dataSourceId=${dataSource.id}] [workspaceUuid=${repository.workspace.uuid}]`
      );
      return;
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedCredentials = decryptor({ cipherTextBlob: encryptedCredentials });

    const credentials = JSON.parse(decryptedCredentials.toString()) as TBitbucketDataSourceCredentials;

    const hmac = crypto.nativeCrypto.createHmac("sha256", credentials.webhookSecret);
    hmac.update(bodyString);
    const calculatedSignature = hmac.digest("hex");

    if (calculatedSignature !== receivedSignature) {
      logger.error(
        `secretScanningV2PushEvent: Bitbucket - Invalid signature for webhook [dataSourceId=${dataSource.id}] [workspaceUuid=${repository.workspace.uuid}]`
      );
      return;
    }

    if (!isAutoScanEnabled) {
      logger.info(
        `secretScanningV2PushEvent: Bitbucket - ignoring due to auto scan disabled [dataSourceId=${dataSource.id}] [workspaceUuid=${repository.workspace.uuid}]`
      );
      return;
    }

    if (includeRepos.includes("*") || includeRepos.includes(repository.full_name)) {
      await secretScanningV2Queue.queueResourceDiffScan({
        dataSourceType: SecretScanningDataSource.Bitbucket,
        payload,
        dataSourceId: dataSource.id
      });
    } else {
      logger.info(
        `secretScanningV2PushEvent: Bitbucket - ignoring due to repository not being present in config [workspaceUuid=${repository.workspace.uuid}] [dataSourceId=${dataSource.id}]`
      );
    }
  };

  return {
    handlePushEvent
  };
};
