import { join } from "path";

import { ProjectMembershipRole, TSecretScanningFindings } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import {
  createTempFolder,
  deleteTempFolder,
  writeTextToFile
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import {
  assertClonedRepositoryWithinSizeLimit,
  parseScanErrorMessage,
  planCommitBatches,
  repositoryHasCommits,
  scanGitRepositoryAndGetFindings
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, getSecretScanningScanBudgetMs } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TSecretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus,
  SecretScanningScanTrigger,
  SecretScanningScanType
} from "./secret-scanning-v2-enums";
import { SECRET_SCANNING_FACTORY_MAP } from "./secret-scanning-v2-factory";
import {
  TFindingsPayload,
  TQueueSecretScanningDataSourceFullScan,
  TQueueSecretScanningResourceDiffScan,
  TQueueSecretScanningResourceDiffScanPayload,
  TQueueSecretScanningSendNotification,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningFinding
} from "./secret-scanning-v2-types";

type TSecretRotationV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "setItemWithExpiryNX" | "getItemPrimary" | "deleteItem">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export type TSecretScanningV2QueueServiceFactory = ReturnType<typeof secretScanningV2QueueServiceFactory>;

const STUCK_SCAN_REAP_BATCH_SIZE = 100;
const STUCK_SCAN_STATUS_MESSAGE =
  "The scan did not complete and was cancelled. This usually means the resource is too large to scan.";

// A full scan usually dies because the worker was OOM-killed on a large repository, which retrying
// does resolve — the pod that picks it up next is not the one that ran out of memory. The two
// budgets are separate in BullMQ and both are needed: `attempts` covers a run that throws, while a
// killed process never throws at all and is recovered by the stalled checker under
// `maxStalledCount`. The delay only has to outlast a restarting pod; nothing is held across it.
const FULL_SCAN_ATTEMPTS = 3;
const FULL_SCAN_MAX_STALLED_COUNT = 2;
const FULL_SCAN_RETRY_DELAY = ms("1m");

const DUPLICATE_FULL_SCAN_STATUS_MESSAGE =
  "Another scan of this resource was already in progress, so this scan was not started.";

export const secretScanningV2QueueServiceFactory = ({
  queueService,
  cronJob,
  secretScanningV2DAL,
  projectMembershipDAL,
  projectDAL,
  smtpService,
  kmsService,
  auditLogService,
  keyStore,
  appConnectionDAL,
  notificationService
}: TSecretRotationV2QueueServiceFactoryDep) => {
  /**
   * Full scans of one resource are serialized across pods by a lease in Redis holding the ID of the
   * scan that owns it. A retry or a stalled-job recovery carries the same scan ID, so it reclaims
   * its own lease and resumes where it left off; a second, distinct scan of the same resource finds
   * the lease held and gives up rather than cloning the repository alongside the first. Renewing is
   * the same operation as acquiring, and returns false once the lease has been lost.
   */
  const acquireFullScanLease = async (resourceId: string, scanId: string) => {
    const key = KeyStorePrefixes.SecretScanningFullScanLease(resourceId);
    const scanBudget = getSecretScanningScanBudgetMs(getConfig());
    const ttlSeconds = Math.ceil(scanBudget / 1000);

    const acquired = await keyStore.setItemWithExpiryNX(key, ttlSeconds, scanId);

    if (acquired) return true;

    // if same scanId, this can be a retry, so allow it
    if ((await keyStore.getItemPrimary(key)) !== scanId) return false;

    await keyStore.setItemWithExpiry(key, ttlSeconds, scanId);

    return true;
  };

  const releaseFullScanLease = async (resourceId: string, scanId: string) => {
    const key = KeyStorePrefixes.SecretScanningFullScanLease(resourceId);

    if ((await keyStore.getItemPrimary(key)) === scanId) await keyStore.deleteItem(key);
  };

  /**
   * Guarded so a retry cannot reopen a scan that already reached a terminal status. The work itself
   * succeeded and only a side effect after it (a notification enqueue, an audit log) threw, so
   * BullMQ hands the whole handler back; without this an already-Completed scan would be reset to
   * `scanning` and, on the last attempt, closed out as Failed. Returns false when the scan was
   * already closed out.
   */
  const markScanAsScanning = async ({ scanId, trackProgress }: { scanId: string; trackProgress?: boolean }) => {
    const startedScans = await secretScanningV2DAL.scans.update(
      {
        id: scanId,
        $in: { status: [SecretScanningScanStatus.Queued, SecretScanningScanStatus.Scanning] }
      },
      {
        status: SecretScanningScanStatus.Scanning,
        startedAt: new Date(),
        ...(trackProgress ? { progressUpdatedAt: new Date() } : {})
      }
    );

    return startedScans.length > 0;
  };

  /**
   * `queued` is accepted alongside `scanning` because a failure before the status was set leaves the
   * row `queued`. A scan the reaper has already failed and notified on is left exactly as it is,
   * which is what the returned flag reports.
   */
  const markScanAsFailed = async ({ scanId, statusMessage }: { scanId: string; statusMessage: string }) => {
    const failedScans = await secretScanningV2DAL.scans.update(
      {
        id: scanId,
        $in: { status: [SecretScanningScanStatus.Queued, SecretScanningScanStatus.Scanning] }
      },
      {
        status: SecretScanningScanStatus.Failed,
        statusMessage,
        completedAt: new Date()
      }
    );

    return failedScans.length > 0;
  };

  const queueDataSourceFullScan = async (
    dataSource: TSecretScanningDataSourceWithConnection,
    { resourceExternalId, triggeredByUserId }: { resourceExternalId?: string; triggeredByUserId?: string } = {}
  ) => {
    try {
      const { type } = dataSource;

      const factory = SECRET_SCANNING_FACTORY_MAP[type]({
        kmsService,
        appConnectionDAL
      });

      const rawResources = await factory.listRawResources(dataSource);

      let filteredRawResources = rawResources;

      // TODO: should add individual resource fetch to factory
      if (resourceExternalId) {
        filteredRawResources = rawResources.filter((resource) => resource.externalId === resourceExternalId);
      }

      if (!filteredRawResources.length) {
        throw new BadRequestError({
          message: `${resourceExternalId ? `Resource with "ID" ${resourceExternalId} could not be found.` : "Data source has no resources to scan"}. Ensure your data source config is correct and not filtering out scanning resources.`
        });
      }

      await secretScanningV2DAL.resources.transaction(async (tx) => {
        const resources = await secretScanningV2DAL.resources.upsert(
          filteredRawResources.map((rawResource) => ({
            ...rawResource,
            dataSourceId: dataSource.id
          })),
          ["externalId", "dataSourceId"],
          tx
        );

        const inFlightScans = await secretScanningV2DAL.scans.find(
          {
            type: SecretScanningScanType.Historical,
            $in: {
              resourceId: resources.map((resource) => resource.id),
              status: [SecretScanningScanStatus.Queued, SecretScanningScanStatus.Scanning]
            }
          },
          { tx }
        );

        const scannedResourceIds = new Set(inFlightScans.map((scan) => scan.resourceId));
        const resourcesToScan = resources.filter((resource) => !scannedResourceIds.has(resource.id));

        if (!resourcesToScan.length) return;

        const scans = await secretScanningV2DAL.scans.insertMany(
          resourcesToScan.map((resource) => ({
            resourceId: resource.id,
            type: SecretScanningScanType.Historical,
            trigger: SecretScanningScanTrigger.Manual,
            triggeredByUserId: triggeredByUserId ?? null
          })),
          tx
        );

        for (const scan of scans) {
          // eslint-disable-next-line no-await-in-loop
          await queueService.queue(
            QueueName.SecretScanningV2FullScan,
            QueueJobs.SecretScanningV2FullScan,
            {
              scanId: scan.id,
              resourceId: scan.resourceId,
              dataSourceId: dataSource.id
            },
            {
              jobId: scan.id,
              removeOnFail: true,
              attempts: FULL_SCAN_ATTEMPTS,
              backoff: { type: "fixed", delay: FULL_SCAN_RETRY_DELAY }
            }
          );
        }
      });
    } catch (error) {
      logger.error(error, `Failed to queue full-scan for data source with ID "${dataSource.id}"`);

      if (error instanceof BadRequestError) throw error;

      throw new InternalServerError({ message: `Failed to queue scan: ${(error as Error).message}` });
    }
  };

  const handleFullScan = async (job: {
    id?: string;
    data: TQueueSecretScanningDataSourceFullScan;
    attemptsMade: number;
    opts: { attempts?: number };
  }) => {
    const { scanId, resourceId, dataSourceId } = job.data;
    const retryCount = job.attemptsMade + 1;
    const retryLimit = job.opts.attempts || 1;
    const startedAt = Date.now();

    const logDetails = `[scanId=${scanId}] [resourceId=${resourceId}] [dataSourceId=${dataSourceId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

    // Read from the primary: a lagging replica would report a just-queued scan as missing, and a job
    // that returns here leaves its scan `queued`, which the stuck-scan reaper never picks up.
    const primary = secretScanningV2DAL.primaryNode();
    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId, primary);
    const resource = dataSource ? await secretScanningV2DAL.resources.findById(resourceId, primary) : undefined;
    const scan = resource ? await secretScanningV2DAL.scans.findById(scanId, primary) : undefined;

    // Deleting a source cascades to its resources and scans, so a job queued before the delete has
    // nothing left to scan. Completing it rather than throwing keeps retries from holding the worker.
    if (!dataSource || !resource || !scan) {
      logger.info(`secretScanningV2Queue: Full Scan aborted, scan no longer exists ${logDetails}`);
      return;
    }

    const tempFolder = await createTempFolder();

    // Logged before any work so a `ps` on a saturated worker can be tied back to a scan ID.
    logger.info(
      `secretScanningV2Queue: Full Scan Started ${logDetails} [scanType=${SecretScanningScanType.Historical}] [tempFolder=${tempFolder}]`
    );

    let holdsLease = false;

    try {
      holdsLease = await acquireFullScanLease(resourceId, scanId);

      if (!holdsLease) {
        await markScanAsFailed({ scanId, statusMessage: DUPLICATE_FULL_SCAN_STATUS_MESSAGE });

        logger.warn(`secretScanningV2Queue: Full Scan Skipped, resource is already being scanned ${logDetails}`);

        return;
      }

      const started = await markScanAsScanning({ scanId, trackProgress: true });

      if (!started) {
        logger.warn(
          `secretScanningV2Queue: Full Scan skipped, scan was already closed out ${logDetails} [scanType=${SecretScanningScanType.Historical}]`
        );
        return;
      }

      let connection: TAppConnection | null = null;
      if (dataSource.connection) connection = await decryptAppConnection(dataSource.connection, kmsService);

      const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type as SecretScanningDataSource]({
        kmsService,
        appConnectionDAL
      });

      const findingsPath = join(tempFolder, "findings.json");

      const scanPath = await factory.getFullScanPath({
        dataSource: {
          ...dataSource,
          connection
        } as TSecretScanningDataSourceWithConnection,
        resourceName: resource.name,
        tempFolder
      });

      const config = await secretScanningV2DAL.configs.findOne({
        projectId: dataSource.projectId
      });

      let configPath: string | undefined;

      if (config && config.content) {
        configPath = join(tempFolder, "infisical-scan.toml");
        await writeTextToFile(configPath, config.content);
      }

      // Counts what this attempt scanned, for the progress logs only. The scan's finding total is
      // read from the database at the end, because an attempt that resumes a partly-scanned scan
      // never sees the batches an earlier one already persisted.
      let scannedFindingsCount = 0;

      /**
       * Each batch is made durable on its own: its findings and the commit it reached are committed
       * before the next `infisical scan` starts, so a worker killed mid-scan resumes from there
       * rather than re-walking history it has already paid for. Returns whether this run still owns
       * the scan and its lease.
       */
      const persistBatch = async (
        batchFindings: TFindingsPayload,
        resumePoint?: { lastScannedCommit: string; lastScannedCommitDigest: string }
      ) => {
        const owned = await secretScanningV2DAL.findings.transaction(async (tx) => {
          if (batchFindings.length) {
            await secretScanningV2DAL.findings.upsert(
              batchFindings.map((finding) => ({
                ...finding,
                resourceId,
                scanId
              })),
              ["resourceId", "fingerprint"],
              tx,
              // a no-op merge, so rows already found by an earlier scan are returned with their original scanId
              ["ruleKey"]
            );
          }

          const progressed = await secretScanningV2DAL.scans.update(
            { id: scanId, status: SecretScanningScanStatus.Scanning },
            { ...resumePoint, progressUpdatedAt: new Date() },
            tx
          );

          return Boolean(progressed.length);
        });

        if (!owned) return false;

        // Renewed on the same beat progress is recorded, so the lease outlives a scan of any length
        // without a timer of its own. Losing it means another scan of this resource has taken over.
        holdsLease = await acquireFullScanLease(resourceId, scanId);

        if (!holdsLease) {
          logger.warn(`secretScanningV2Queue: Full Scan lost its lease on the resource ${logDetails}`);
        }

        return holdsLease;
      };

      let stillOwned = true;

      const scanRepository = async () => {
        const repoSizeMb = await assertClonedRepositoryWithinSizeLimit(resource.name, scanPath);

        logger.info(`secretScanningV2Queue: Full Scan Cloned ${logDetails} repoSizeMb=[${repoSizeMb ?? "unknown"}]`);

        // nothing to scan, and both git history commands fail on an unborn HEAD
        if (!(await repositoryHasCommits(scanPath))) {
          logger.info(`secretScanningV2Queue: Full Scan found no commits, completing ${logDetails}`);
          return;
        }

        const { SECRET_SCANNING_COMMIT_BATCH_SIZE: batchSize } = getConfig();

        if (!batchSize) {
          const batchFindings = await scanGitRepositoryAndGetFindings(scanPath, findingsPath, configPath);
          scannedFindingsCount += batchFindings.length;
          stillOwned = await persistBatch(batchFindings);
          return;
        }

        const plan = await planCommitBatches({
          repoPath: scanPath,
          batchSize,
          resumeAfterCommit: scan.lastScannedCommit,
          resumeAfterCommitDigest: scan.lastScannedCommitDigest
        });

        logger.info(
          `secretScanningV2Queue: Full Scan Planned ${logDetails} totalCommits=[${plan.totalCommits}] batches=[${plan.batches.length}] batchSize=[${batchSize}] resumed=[${plan.resumed}]`
        );

        for (const [index, batch] of plan.batches.entries()) {
          // eslint-disable-next-line no-await-in-loop
          const batchFindings = await scanGitRepositoryAndGetFindings(
            scanPath,
            join(tempFolder, `findings-${index}.json`),
            configPath,
            batch
          );

          scannedFindingsCount += batchFindings.length;

          // eslint-disable-next-line no-await-in-loop
          stillOwned = await persistBatch(batchFindings, {
            lastScannedCommit: batch.lastCommit,
            lastScannedCommitDigest: batch.prefixDigest
          });

          if (!stillOwned) break;

          logger.info(
            `secretScanningV2Queue: Full Scan Batch Complete ${logDetails} batch=[${index + 1}/${plan.batches.length}] findings=[${batchFindings.length}] durationMs=[${Date.now() - startedAt}]`
          );
        }
      };

      await scanRepository();

      // Guarded on the state this run is finishing: if the reaper already gave up on this scan, the
      // row keeps its failure and this update matches nothing. Findings are still written — they
      // are real — but the outcome the customer was told about is not rewritten underneath them.
      const completedScans = stillOwned
        ? await secretScanningV2DAL.scans.update(
            { id: scanId, status: SecretScanningScanStatus.Scanning },
            {
              status: SecretScanningScanStatus.Completed,
              statusMessage: null,
              completedAt: new Date()
            }
          )
        : [];

      if (!completedScans.length) {
        logger.warn(
          `secretScanningV2Queue: Full Scan finished after the scan was already closed out ${logDetails} scannedFindings=[${scannedFindingsCount}] durationMs=[${Date.now() - startedAt}]`
        );
        return;
      }

      // Read back rather than counted in the handler: the findings an earlier attempt persisted are
      // part of this scan's total, and a resumed attempt never scanned the batches they came from.
      const findingsCount = await secretScanningV2DAL.findings.countByScanId(scanId);

      if (findingsCount) {
        await queueService.queue(
          QueueName.SecretScanningV2,
          QueueJobs.SecretScanningV2SendNotification,
          {
            status: SecretScanningScanStatus.Completed,
            resourceName: resource.name,
            isDiffScan: false,
            dataSource,
            numberOfSecrets: findingsCount,
            scanId
          },
          { removeOnFail: true, jobId: `secret-scanning-notification-${scanId}` }
        );
      }

      await auditLogService.createAuditLog({
        projectId: dataSource.projectId,
        actor: {
          type: ActorType.PLATFORM,
          metadata: {}
        },
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN,
          metadata: {
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            dataSourceType: dataSource.type,
            resourceId: resource.id,
            resourceName: resource.name,
            scanId,
            scanStatus: SecretScanningScanStatus.Completed,
            scanType: SecretScanningScanType.Historical,
            numberOfSecretsDetected: findingsCount
          }
        }
      });

      logger.info(
        `secretScanningV2Queue: Full Scan Complete ${logDetails} findings=[${findingsCount}] scannedFindings=[${scannedFindingsCount}] durationMs=[${Date.now() - startedAt}]`
      );
    } catch (error) {
      // A source deleted mid-scan takes the scan with it, so the next findings write fails its FK.
      if (!(await secretScanningV2DAL.scans.findById(scanId, secretScanningV2DAL.primaryNode()))) {
        logger.info(`secretScanningV2Queue: Full Scan aborted, scan was deleted while running ${logDetails}`);
        return;
      }

      if (retryCount === retryLimit) {
        const errorMessage = parseScanErrorMessage(error);

        const failed = await markScanAsFailed({ scanId, statusMessage: errorMessage });

        if (failed) {
          await queueService.queue(
            QueueName.SecretScanningV2,
            QueueJobs.SecretScanningV2SendNotification,
            {
              status: SecretScanningScanStatus.Failed,
              resourceName: resource.name,
              dataSource,
              errorMessage
            },
            { jobId: `secret-scanning-notification-${scanId}`, removeOnFail: true }
          );

          await auditLogService.createAuditLog({
            projectId: dataSource.projectId,
            actor: {
              type: ActorType.PLATFORM,
              metadata: {}
            },
            event: {
              type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN,
              metadata: {
                dataSourceId: dataSource.id,
                dataSourceName: dataSource.name,
                dataSourceType: dataSource.type,
                resourceId: resource.id,
                resourceName: resource.name,
                scanId,
                scanStatus: SecretScanningScanStatus.Failed,
                scanType: SecretScanningScanType.Historical
              }
            }
          });
        }
      }

      logger.error(
        error,
        `secretScanningV2Queue: Full Scan Failed ${logDetails} durationMs=[${Date.now() - startedAt}]`
      );
      throw error;
    } finally {
      if (holdsLease) await releaseFullScanLease(resourceId, scanId);
      await deleteTempFolder(tempFolder);
    }
  };

  const queueResourceDiffScan = async ({
    payload,
    dataSourceId,
    dataSourceType
  }: Omit<TQueueSecretScanningResourceDiffScanPayload, "scanId" | "resourceId">) => {
    const factory = SECRET_SCANNING_FACTORY_MAP[dataSourceType as SecretScanningDataSource]({
      kmsService,
      appConnectionDAL
    });

    const resourcePayload = factory.getDiffScanResourcePayload(payload);

    try {
      const { resourceId, scanId } = await secretScanningV2DAL.resources.transaction(async (tx) => {
        const [resource] = await secretScanningV2DAL.resources.upsert(
          [
            {
              ...resourcePayload,
              dataSourceId
            }
          ],
          ["externalId", "dataSourceId"],
          tx
        );

        const scan = await secretScanningV2DAL.scans.create(
          {
            resourceId: resource.id,
            type: SecretScanningScanType.Realtime,
            trigger: SecretScanningScanTrigger.Push
          },
          tx
        );

        return {
          resourceId: resource.id,
          scanId: scan.id
        };
      });

      await queueService.queue(
        QueueName.SecretScanningV2RealtimeScan,
        QueueJobs.SecretScanningV2DiffScan,
        {
          payload,
          dataSourceId,
          dataSourceType,
          scanId,
          resourceId
        },
        {
          jobId: scanId,
          removeOnFail: true
        }
      );
    } catch (error) {
      logger.error(
        error,
        `secretScanningV2Queue: Failed to queue diff scan [dataSourceId=${dataSourceId}] [resourceExternalId=${resourcePayload.externalId}]`
      );
    }
  };

  const handleDiffScan = async (job: {
    id?: string;
    data: TQueueSecretScanningResourceDiffScan;
    attemptsMade: number;
    opts: { attempts?: number };
  }) => {
    const { payload, dataSourceId, resourceId, scanId } = job.data;
    const retryCount = job.attemptsMade + 1;
    const retryLimit = job.opts.attempts || 1;
    const startedAt = Date.now();

    const logDetails = `[dataSourceId=${dataSourceId}] [scanId=${scanId}] [resourceId=${resourceId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

    // Primary for the same reason as the full scan: a lagging replica would drop a just-queued scan.
    const primary = secretScanningV2DAL.primaryNode();
    const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId, primary);
    const resource = dataSource ? await secretScanningV2DAL.resources.findById(resourceId, primary) : undefined;

    if (!dataSource || !resource) {
      logger.info(`secretScanningV2Queue: Diff Scan aborted, scan no longer exists ${logDetails}`);
      return;
    }

    const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type as SecretScanningDataSource]({
      kmsService,
      appConnectionDAL
    });

    const tempFolder = await createTempFolder();

    logger.info(
      `secretScanningV2Queue: Diff Scan Started ${logDetails} [scanType=${SecretScanningScanType.Realtime}] [tempFolder=${tempFolder}]`
    );

    try {
      const started = await markScanAsScanning({ scanId });

      if (!started) {
        logger.warn(
          `secretScanningV2Queue: Diff Scan skipped, scan was already closed out ${logDetails} [scanType=${SecretScanningScanType.Realtime}]`
        );
        return;
      }

      let connection: TAppConnection | null = null;
      if (dataSource.connection) connection = await decryptAppConnection(dataSource.connection, kmsService);

      const config = await secretScanningV2DAL.configs.findOne({
        projectId: dataSource.projectId
      });

      let configPath: string | undefined;

      if (config && config.content) {
        configPath = join(tempFolder, "infisical-scan.toml");
        await writeTextToFile(configPath, config.content);
      }

      const findingsPayload = await factory.getDiffScanFindingsPayload({
        dataSource: {
          ...dataSource,
          connection
        } as TSecretScanningDataSourceWithConnection,
        resourceName: resource.name,
        payload,
        configPath
      });

      const { allFindings, closedOutByThisRun } = await secretScanningV2DAL.findings.transaction(async (tx) => {
        let findings: TSecretScanningFindings[] = [];

        if (findingsPayload.length) {
          findings = await secretScanningV2DAL.findings.upsert(
            findingsPayload.map((finding) => ({
              ...finding,
              resourceId,
              scanId
            })),
            ["resourceId", "fingerprint"],
            tx,
            ["ruleKey"]
          );
        }

        // Same guard as the full scan: a scan the reaper already failed keeps that outcome.
        const completedScans = await secretScanningV2DAL.scans.update(
          { id: scanId, status: SecretScanningScanStatus.Scanning },
          {
            status: SecretScanningScanStatus.Completed,
            completedAt: new Date()
          },
          tx
        );

        return { allFindings: findings, closedOutByThisRun: Boolean(completedScans.length) };
      });

      if (!closedOutByThisRun) {
        logger.warn(
          `secretScanningV2Queue: Diff Scan finished after the scan was already closed out ${logDetails} findings=[${findingsPayload.length}] durationMs=[${Date.now() - startedAt}]`
        );
        return;
      }

      const newFindings = allFindings.filter((finding) => finding.scanId === scanId);

      if (newFindings.length) {
        const finding = newFindings[0] as TSecretScanningFinding;
        await queueService.queue(
          QueueName.SecretScanningV2,
          QueueJobs.SecretScanningV2SendNotification,
          {
            status: SecretScanningScanStatus.Completed,
            resourceName: resource.name,
            isDiffScan: true,
            dataSource,
            numberOfSecrets: newFindings.length,
            scanId,
            authorName: finding?.details?.author,
            authorEmail: finding?.details?.email
          },
          { jobId: `secret-scanning-notification-${scanId}` }
        );
      }

      await auditLogService.createAuditLog({
        projectId: dataSource.projectId,
        actor: {
          type: ActorType.PLATFORM,
          metadata: {}
        },
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN,
          metadata: {
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            dataSourceType: dataSource.type,
            resourceId,
            resourceName: resource.name,
            scanId,
            scanStatus: SecretScanningScanStatus.Completed,
            scanType: SecretScanningScanType.Realtime,
            numberOfSecretsDetected: findingsPayload.length
          }
        }
      });

      logger.info(
        `secretScanningV2Queue: Diff Scan Complete ${logDetails} findings=[${findingsPayload.length}] durationMs=[${Date.now() - startedAt}]`
      );
    } catch (error) {
      if (!(await secretScanningV2DAL.scans.findById(scanId, secretScanningV2DAL.primaryNode()))) {
        logger.info(`secretScanningV2Queue: Diff Scan aborted, scan was deleted while running ${logDetails}`);
        return;
      }

      if (retryCount === retryLimit) {
        const errorMessage = parseScanErrorMessage(error);

        const failed = await markScanAsFailed({ scanId, statusMessage: errorMessage });

        if (failed) {
          await queueService.queue(
            QueueName.SecretScanningV2,
            QueueJobs.SecretScanningV2SendNotification,
            {
              status: SecretScanningScanStatus.Failed,
              resourceName: resource.name,
              dataSource,
              errorMessage
            },
            { jobId: `secret-scanning-notification-${scanId}` }
          );

          await auditLogService.createAuditLog({
            projectId: dataSource.projectId,
            actor: {
              type: ActorType.PLATFORM,
              metadata: {}
            },
            event: {
              type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN,
              metadata: {
                dataSourceId: dataSource.id,
                dataSourceName: dataSource.name,
                dataSourceType: dataSource.type,
                resourceId: resource.id,
                resourceName: resource.name,
                scanId,
                scanStatus: SecretScanningScanStatus.Failed,
                scanType: SecretScanningScanType.Realtime
              }
            }
          });
        }
      }

      logger.error(
        error,
        `secretScanningV2Queue: Diff Scan Failed ${logDetails} durationMs=[${Date.now() - startedAt}]`
      );
      throw error;
    } finally {
      await deleteTempFolder(tempFolder);
    }
  };

  const handleSendNotification = async (job: { data: TQueueSecretScanningSendNotification }) => {
    const { dataSource, resourceName, ...payload } = job.data;

    const appCfg = getConfig();

    if (!appCfg.isSmtpConfigured) return;

    // The payload carries a snapshot of the source; one deleted since the scan finished has nothing
    // left to link to.
    if (!(await secretScanningV2DAL.dataSources.findById(dataSource.id, secretScanningV2DAL.primaryNode()))) {
      logger.info(
        `secretScanningV2Queue: Skipped Status Notification, data source was deleted [dataSourceId=${dataSource.id}] [resourceName=${resourceName}] [status=${payload.status}]`
      );
      return;
    }

    try {
      const { projectId } = dataSource;

      logger.info(
        `secretScanningV2Queue: Sending Status Notification [dataSourceId=${dataSource.id}] [resourceName=${resourceName}] [status=${payload.status}]`
      );

      const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
      const project = await projectDAL.findById(projectId);

      const recipients = projectMembers.filter((member) => {
        const isAdmin = member.roles.some((role) => role.role === ProjectMembershipRole.Admin);
        const isCompleted = payload.status === SecretScanningScanStatus.Completed;
        // We assume that the committer is one of the project members
        const isCommitter = isCompleted && payload.authorEmail === member.user.email;
        return isAdmin || isCommitter;
      });

      const timestamp = new Date().toISOString();

      const subjectLine =
        payload.status === SecretScanningScanStatus.Completed
          ? "Incident Alert: Secret(s) Leaked"
          : `Secret Scanning Failed`;

      await notificationService.createUserNotifications(
        recipients.map((member) => ({
          userId: member.userId,
          orgId: project.orgId,
          type:
            payload.status === SecretScanningScanStatus.Completed
              ? NotificationType.SECRET_SCANNING_SECRETS_DETECTED
              : NotificationType.SECRET_SCANNING_SCAN_FAILED,
          title: subjectLine,
          body:
            payload.status === SecretScanningScanStatus.Completed
              ? `Uncovered **${payload.numberOfSecrets}** secret(s) ${payload.isDiffScan ? " from a recent commit to" : " in"} **${resourceName}**.`
              : `Encountered an error while attempting to scan the resource **${resourceName}**: ${payload.errorMessage}`,
          link:
            payload.status === SecretScanningScanStatus.Completed
              ? `/projects/secret-scanning/${projectId}/findings?search=scanId:${payload.scanId}`
              : `/projects/secret-scanning/${projectId}/data-sources/${dataSource.type}/${dataSource.id}`
        }))
      );

      await smtpService.sendMail({
        recipients: recipients.map((member) => member.user.email!).filter(Boolean),
        template:
          payload.status === SecretScanningScanStatus.Completed
            ? SmtpTemplates.SecretScanningV2SecretsDetected
            : SmtpTemplates.SecretScanningV2ScanFailed,
        subjectLine,
        substitutions:
          payload.status === SecretScanningScanStatus.Completed
            ? {
                authorName: payload.authorName,
                authorEmail: payload.authorEmail,
                resourceName,
                numberOfSecrets: payload.numberOfSecrets,
                isDiffScan: payload.isDiffScan,
                url: encodeURI(
                  `${appCfg.SITE_URL}/organizations/${project.orgId}/projects/secret-scanning/${projectId}/findings?search=scanId:${payload.scanId}`
                ),
                timestamp
              }
            : {
                dataSourceName: dataSource.name,
                resourceName,
                projectName: project.name,
                timestamp,
                errorMessage: payload.errorMessage,
                url: encodeURI(
                  `${appCfg.SITE_URL}/organizations/${project.orgId}/projects/secret-scanning/${projectId}/data-sources/${dataSource.type}/${dataSource.id}`
                )
              }
      });
    } catch (error) {
      logger.error(
        error,
        `secretScanningV2Queue: Failed to Send Status Notification [dataSourceId=${dataSource.id}] [resourceName=${resourceName}] [status=${payload.status}]`
      );
      throw error;
    }
  };

  // A worker killed mid-scan (OOM, task replacement, host loss) never reaches its own failure path,
  // so the row it set to `scanning` stays that way forever and the customer sees a scan permanently
  // in progress.
  const failStuckScan = async (scan: Awaited<ReturnType<typeof secretScanningV2DAL.scans.findStuck>>[number]) => {
    const logDetails = `[scanId=${scan.id}] [resourceId=${scan.resourceId}] [dataSourceId=${scan.dataSourceId}] [startedAt=${scan.startedAt?.toISOString()}]`;

    try {
      // Guarded on the status we read: if the worker did finish between the read and this write, the
      // update matches nothing and the scan keeps its real outcome.
      const updatedScans = await secretScanningV2DAL.scans.update(
        { id: scan.id, status: SecretScanningScanStatus.Scanning },
        {
          status: SecretScanningScanStatus.Failed,
          statusMessage: STUCK_SCAN_STATUS_MESSAGE,
          completedAt: new Date()
        }
      );

      if (!updatedScans.length) return;

      logger.warn(`secretScanningV2Queue: Reaped Stuck Scan ${logDetails}`);

      const dataSource = await secretScanningV2DAL.dataSources.findById(scan.dataSourceId);

      if (!dataSource) return;

      await queueService.queue(
        QueueName.SecretScanningV2,
        QueueJobs.SecretScanningV2SendNotification,
        {
          status: SecretScanningScanStatus.Failed,
          resourceName: scan.resourceName,
          dataSource,
          errorMessage: STUCK_SCAN_STATUS_MESSAGE
        },
        { jobId: `secret-scanning-notification-${scan.id}`, removeOnFail: true }
      );

      await auditLogService.createAuditLog({
        projectId: dataSource.projectId,
        actor: {
          type: ActorType.PLATFORM,
          metadata: {}
        },
        event: {
          type: EventType.SECRET_SCANNING_DATA_SOURCE_SCAN,
          metadata: {
            dataSourceId: dataSource.id,
            dataSourceName: dataSource.name,
            dataSourceType: dataSource.type,
            resourceId: scan.resourceId,
            resourceName: scan.resourceName,
            scanId: scan.id,
            scanStatus: SecretScanningScanStatus.Failed,
            scanType: scan.type as SecretScanningScanType
          }
        }
      });
    } catch (error) {
      logger.error(error, `secretScanningV2Queue: Failed to Reap Stuck Scan ${logDetails}`);
    }
  };

  cronJob.register({
    name: CronJobName.SecretScanningStuckScanReaper,
    pattern: "*/10 * * * *",
    runHashTtlS: 60 * 60,
    handler: async () => {
      const { SECRET_SCANNING_STUCK_SCAN_TIMEOUT } = getConfig();

      const stuckScans = await secretScanningV2DAL.scans.findStuck(
        new Date(Date.now() - SECRET_SCANNING_STUCK_SCAN_TIMEOUT),
        STUCK_SCAN_REAP_BATCH_SIZE
      );

      if (!stuckScans.length) return;

      logger.warn(`secretScanningV2Queue: Reaping Stuck Scans [count=${stuckScans.length}]`);

      for (const scan of stuckScans) {
        // eslint-disable-next-line no-await-in-loop
        await failStuckScan(scan);
      }
    }
  });

  queueService.start(
    QueueName.SecretScanningV2FullScan,
    async (job) => {
      await handleFullScan(job as Parameters<typeof handleFullScan>[0]);
    },
    { concurrency: 1, maxStalledCount: FULL_SCAN_MAX_STALLED_COUNT }
  );

  queueService.start(
    QueueName.SecretScanningV2RealtimeScan,
    async (job) => {
      await handleDiffScan(job as Parameters<typeof handleDiffScan>[0]);
    },
    { concurrency: 5 }
  );

  queueService.start(QueueName.SecretScanningV2, async (job) => {
    // We are keeping this for now because once deployed, the queue might still have
    // full scan and diff scan messages in it and need to be processed.
    if (job.name === QueueJobs.SecretScanningV2FullScan) {
      await handleFullScan(job as Parameters<typeof handleFullScan>[0]);
    } else if (job.name === QueueJobs.SecretScanningV2DiffScan) {
      await handleDiffScan(job as Parameters<typeof handleDiffScan>[0]);
    } else if (job.name === QueueJobs.SecretScanningV2SendNotification) {
      await handleSendNotification(job as Parameters<typeof handleSendNotification>[0]);
    }
  });

  return {
    queueDataSourceFullScan,
    queueResourceDiffScan
  };
};
