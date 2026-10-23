import { logger } from "@app/lib/logger";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenConfigDALFactory } from "../honey-token-config/honey-token-config-dal";
import { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenStatus, HoneyTokenType } from "./honey-token-enums";
import { getHoneyTokenServiceHooksByType, HONEY_TOKEN_PROVIDER_MAP } from "./honey-token-provider-fns";
import { THoneyTokenProviderHooksDep } from "./honey-token-service-types";

const FOLDERLESS_CLEANUP_BATCH = 100;

type THoneyTokenCleanupServiceFactoryDep = {
  honeyTokenDAL: Pick<
    THoneyTokenDALFactory,
    "findUnrevokedByProjectIdForCleanup" | "findFolderlessForCleanup" | "delete"
  >;
  honeyTokenConfigDAL: Pick<THoneyTokenConfigDALFactory, "findOne">;
} & THoneyTokenProviderHooksDep;

type THoneyTokenCleanupRow = Awaited<ReturnType<THoneyTokenDALFactory["findFolderlessForCleanup"]>>[number];

export type THoneyTokenCleanupServiceFactory = ReturnType<typeof honeyTokenCleanupServiceFactory>;

export const honeyTokenCleanupServiceFactory = ({
  honeyTokenDAL,
  honeyTokenConfigDAL,
  kmsService,
  appConnectionDAL
}: THoneyTokenCleanupServiceFactoryDep) => {
  const providerHooksByType = getHoneyTokenServiceHooksByType({ kmsService, appConnectionDAL });

  // Returns the ids that need no further attempt: revoked, already revoked, or impossible to revoke
  // because the org no longer has a honey token configuration. Anything else is left for a retry.
  const $revokeCredentials = async (honeyTokens: THoneyTokenCleanupRow[]) => {
    const settledIds: string[] = [];
    const connectionByOrgAndType = new Map<string, TAppConnection | null>();

    for await (const honeyToken of honeyTokens) {
      const logContext = `[honeyTokenId=${honeyToken.id}] [projectId=${honeyToken.projectId}] [orgId=${honeyToken.orgId}]`;

      if (honeyToken.status === HoneyTokenStatus.Revoked) {
        settledIds.push(honeyToken.id);
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        const type = honeyToken.type as HoneyTokenType;
        if (!Object.hasOwn(HONEY_TOKEN_PROVIDER_MAP, type)) {
          logger.warn(`honey-token-cleanup: unsupported honey token type [type=${honeyToken.type}] ${logContext}`);
          settledIds.push(honeyToken.id);
          // eslint-disable-next-line no-continue
          continue;
        }

        const connectionKey = `${honeyToken.orgId}:${type}`;
        if (!connectionByOrgAndType.has(connectionKey)) {
          const config = await honeyTokenConfigDAL.findOne({ orgId: honeyToken.orgId, type });
          const rawConnection = config?.connectionId ? await appConnectionDAL.findById(config.connectionId) : null;
          connectionByOrgAndType.set(
            connectionKey,
            rawConnection ? await decryptAppConnection(rawConnection, kmsService) : null
          );
        }

        const appConnection = connectionByOrgAndType.get(connectionKey);
        if (!appConnection) {
          logger.warn(
            `honey-token-cleanup: org has no honey token connection, cannot revoke provider credentials [type=${type}] ${logContext}`
          );
          settledIds.push(honeyToken.id);
          // eslint-disable-next-line no-continue
          continue;
        }

        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: honeyToken.projectId
        });
        const credentials = JSON.parse(
          decryptor({ cipherTextBlob: honeyToken.encryptedCredentials }).toString()
        ) as Record<string, string>;

        await providerHooksByType[type].revokeCredentials({ appConnection, credentials });
        settledIds.push(honeyToken.id);
        logger.info(`honey-token-cleanup: revoked provider credentials ${logContext}`);
      } catch (err) {
        logger.error({ err }, `honey-token-cleanup: failed to revoke provider credentials ${logContext}`);
      }
    }

    return settledIds;
  };

  // Must run before the project row is deleted: the cascade drops the project KMS key that the
  // credentials are encrypted with. Best effort, so a provider outage never blocks the delete.
  const revokeProjectHoneyTokens = async (projectId: string) => {
    const honeyTokens = await honeyTokenDAL.findUnrevokedByProjectIdForCleanup(projectId);
    if (!honeyTokens.length) return;

    await $revokeCredentials(honeyTokens);
  };

  // A deleted folder or environment leaves its honey tokens behind with a null folderId (see the
  // SET NULL foreign key), so every folder deletion path is covered without each one calling in here.
  const cleanupFolderlessHoneyTokens = async () => {
    try {
      const honeyTokens = await honeyTokenDAL.findFolderlessForCleanup(FOLDERLESS_CLEANUP_BATCH);
      if (!honeyTokens.length) return;

      const settledIds = await $revokeCredentials(honeyTokens);
      if (settledIds.length) {
        await honeyTokenDAL.delete({ $in: { id: settledIds } });
      }

      logger.info(
        `honey-token-cleanup: processed honey tokens of deleted folders [found=${honeyTokens.length}] [removed=${settledIds.length}]`
      );
    } catch (err) {
      logger.error({ err }, "honey-token-cleanup: failed to clean up honey tokens of deleted folders");
    }
  };

  return {
    revokeProjectHoneyTokens,
    cleanupFolderlessHoneyTokens
  };
};
