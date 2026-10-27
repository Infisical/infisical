import { NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn/array";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { THoneyTokenConfigDALFactory } from "../honey-token-config/honey-token-config-dal";
import { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenHosting, HoneyTokenStatus, HoneyTokenType } from "./honey-token-enums";
import { getHoneyTokenServiceHooksByType, HONEY_TOKEN_PROVIDER_MAP } from "./honey-token-provider-fns";
import { THoneyTokenCredentialTarget, THoneyTokenProviderHooksDep } from "./honey-token-service-types";
import { getHoneyTokenHosting } from "./honey-token-types";

const FOLDERLESS_CLEANUP_BATCH = 100;
const MAX_CLEANUP_ATTEMPTS = 3;
const CLEANUP_WORKER_CONCURRENCY = 3;
// Managed tokens all live in one shared AWS account, so an org deletion must not burst its IAM rate limit.
const REVOKE_BATCH_SIZE = 5;

type THoneyTokenCleanupServiceFactoryDep = {
  honeyTokenDAL: Pick<
    THoneyTokenDALFactory,
    | "findUnrevokedByProjectIdForCleanup"
    | "findUnrevokedByOrgTreeForCleanup"
    | "findFolderlessForCleanup"
    | "findByIdForCleanup"
    | "deleteById"
    | "delete"
  >;
  honeyTokenConfigDAL: Pick<THoneyTokenConfigDALFactory, "findOne">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
} & THoneyTokenProviderHooksDep;

type THoneyTokenCleanupRow = Awaited<ReturnType<THoneyTokenDALFactory["findFolderlessForCleanup"]>>[number];

export type THoneyTokenCleanupServiceFactory = ReturnType<typeof honeyTokenCleanupServiceFactory>;

export const honeyTokenCleanupServiceFactory = ({
  honeyTokenDAL,
  honeyTokenConfigDAL,
  kmsService,
  appConnectionDAL,
  queueService
}: THoneyTokenCleanupServiceFactoryDep) => {
  const providerHooksByType = getHoneyTokenServiceHooksByType({ kmsService, appConnectionDAL });

  const $logContext = (honeyToken: THoneyTokenCleanupRow) =>
    `[honeyTokenId=${honeyToken.id}] [projectId=${honeyToken.projectId}] [orgId=${honeyToken.orgId}]`;

  const $fetchConnection = async (orgId: string, type: HoneyTokenType) => {
    const config = await honeyTokenConfigDAL.findOne({ orgId, type });
    const rawConnection = config?.connectionId ? await appConnectionDAL.findById(config.connectionId) : null;
    return rawConnection ? decryptAppConnection(rawConnection, kmsService) : null;
  };

  // Resolves each org's honey token connection once, however many of its tokens are revoked. The credentials
  // are encrypted with the project's KMS key, so every caller must run while the project is still live.
  const $createRevoker = () => {
    const connectionByOrgAndType = new Map<string, Promise<TAppConnection | null>>();

    const findConnection = (orgId: string, type: HoneyTokenType) => {
      const key = `${orgId}:${type}`;
      let connection = connectionByOrgAndType.get(key);
      if (!connection) {
        connection = $fetchConnection(orgId, type);
        connectionByOrgAndType.set(key, connection);
      }
      return connection;
    };

    return async (honeyToken: THoneyTokenCleanupRow) => {
      if (!Object.hasOwn(HONEY_TOKEN_PROVIDER_MAP, honeyToken.type)) {
        throw new NotFoundError({ message: `Unsupported honey token type '${honeyToken.type}'` });
      }
      const type = honeyToken.type as HoneyTokenType;

      if (!honeyToken.projectId || !honeyToken.orgId) {
        throw new NotFoundError({ message: "Honey token's project was deleted before it was revoked" });
      }

      let target: THoneyTokenCredentialTarget = { hosting: HoneyTokenHosting.InfisicalManaged };
      if (getHoneyTokenHosting(honeyToken) === HoneyTokenHosting.CustomerAccount) {
        const appConnection = await findConnection(honeyToken.orgId, type);
        if (!appConnection) {
          throw new NotFoundError({ message: "Organization has no honey token connection" });
        }
        target = { hosting: HoneyTokenHosting.CustomerAccount, appConnection };
      }

      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: honeyToken.projectId
      });
      const credentials = JSON.parse(
        decryptor({ cipherTextBlob: honeyToken.encryptedCredentials }).toString()
      ) as Record<string, string>;

      await providerHooksByType[type].revokeCredentials({ target, credentials });
    };
  };

  // Best effort: a provider failure is logged and the row is deleted regardless, so it never blocks the delete.
  const $revokeAndDelete = async (honeyTokens: THoneyTokenCleanupRow[], reason: string) => {
    if (!honeyTokens.length) return;

    const revoke = $createRevoker();
    for (const batch of chunkArray(honeyTokens, REVOKE_BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.allSettled(batch.map((honeyToken) => revoke(honeyToken)));
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          logger.error(
            { err: result.reason as unknown },
            `honey-token-cleanup: could not clean up honey token on ${reason} ${$logContext(batch[i])}`
          );
        }
      });
    }

    await honeyTokenDAL.delete({ $in: { id: honeyTokens.map((honeyToken) => honeyToken.id) } });
  };

  // Runs before the project is soft-deleted: after that its KMS key no longer resolves and the credentials
  // cannot be decrypted.
  const revokeProjectHoneyTokens = async (projectId: string) =>
    $revokeAndDelete(await honeyTokenDAL.findUnrevokedByProjectIdForCleanup(projectId), "project deletion");

  // Runs before the org row is deleted: the cascade drops the honey token configuration and the app
  // connection needed to reach the provider.
  const revokeOrgHoneyTokens = async (orgId: string) =>
    $revokeAndDelete(await honeyTokenDAL.findUnrevokedByOrgTreeForCleanup(orgId), "org deletion");

  // Deleting a folder or environment leaves its honey tokens behind with a null folderId (the foreign key is
  // SET NULL), so every folder deletion path is covered without each one calling in here. The jobId keeps a
  // row that is already queued from being queued again.
  const cleanupFolderlessHoneyTokens = async () => {
    try {
      const honeyTokens = await honeyTokenDAL.findFolderlessForCleanup(FOLDERLESS_CLEANUP_BATCH);

      await Promise.all(
        honeyTokens.map((honeyToken) =>
          queueService.queue(
            QueueName.HoneyTokenCleanup,
            QueueJobs.HoneyTokenCleanup,
            { honeyTokenId: honeyToken.id },
            {
              jobId: `honey-token-cleanup-${honeyToken.id}`,
              attempts: MAX_CLEANUP_ATTEMPTS,
              backoff: { type: "exponential", delay: 30_000 },
              removeOnComplete: true,
              removeOnFail: true
            }
          )
        )
      );
    } catch (err) {
      logger.error({ err }, "honey-token-cleanup: failed to queue clean up of honey tokens of deleted folders");
    }
  };

  const $processCleanupJob = async (honeyTokenId: string, isLastAttempt: boolean) => {
    const honeyToken = await honeyTokenDAL.findByIdForCleanup(honeyTokenId);
    if (!honeyToken) return;

    // Its project, and the KMS key its credentials are encrypted with, are gone: it was created while the
    // project or org was being deleted, so retrying cannot revoke it.
    if (!honeyToken.projectId && honeyToken.status !== HoneyTokenStatus.Revoked) {
      logger.error(
        `honey-token-cleanup: could not clean up honey token, its project was deleted before it was revoked ${$logContext(honeyToken)}`
      );
      await honeyTokenDAL.deleteById(honeyToken.id);
      return;
    }

    try {
      if (honeyToken.status !== HoneyTokenStatus.Revoked) {
        await $createRevoker()(honeyToken);
      }
    } catch (err) {
      if (!isLastAttempt) throw err;

      // Deleting here, rather than letting the job fail, keeps the next cron run from queueing it again.
      logger.error(
        { err },
        `honey-token-cleanup: could not clean up honey token after ${MAX_CLEANUP_ATTEMPTS} attempts, deleting it anyway ${$logContext(honeyToken)}`
      );
    }

    await honeyTokenDAL.deleteById(honeyToken.id);
  };

  const init = () => {
    queueService.start(
      QueueName.HoneyTokenCleanup,
      async (job) => {
        await $processCleanupJob(job.data.honeyTokenId, job.attemptsMade + 1 >= MAX_CLEANUP_ATTEMPTS);
      },
      { concurrency: CLEANUP_WORKER_CONCURRENCY }
    );
  };

  return {
    revokeProjectHoneyTokens,
    revokeOrgHoneyTokens,
    cleanupFolderlessHoneyTokens,
    init
  };
};
