import { join } from "path";

import { ProjectMembershipRole } from "@app/db/schemas/models";
import { TSecretScanningFindings } from "@app/db/schemas/secret-scanning-findings";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import {
  createTempFolder,
  deleteTempFolder,
  writeTextToFile
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import {
  parseScanErrorMessage,
  scanGitRepositoryAndGetFindings
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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
  SecretScanningResource,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "./secret-scanning-v2-enums";
import { SECRET_SCANNING_FACTORY_MAP } from "./secret-scanning-v2-factory";
import {
  TFindingsPayload,
  TQueueSecretScanningDataSourceFullScan,
  TQueueSecretScanningResourceDiffScan,
  TQueueSecretScanningSendNotification,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningFinding
} from "./secret-scanning-v2-types";

type TSecretRotationV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export type TSecretScanningV2QueueServiceFactory = Awaited<ReturnType<typeof secretScanningV2QueueServiceFactory>>;

export const secretScanningV2QueueServiceFactory = async ({
  queueService,
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
  const queueDataSourceFullScan = async (
    dataSource: TSecretScanningDataSourceWithConnection,
    resourceExternalId?: string
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

      for (const resource of filteredRawResources) {
        // eslint-disable-next-line no-await-in-loop
        if (await keyStore.getItem(KeyStorePrefixes.SecretScanningLock(dataSource.id, resource.externalId))) {
          throw new BadRequestError({ message: `A scan is already in progress for resource "${resource.name}"` });
        }
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

        const scans = await secretScanningV2DAL.scans.insertMany(
          resources.map((resource) => ({
            resourceId: resource.id,
            type: SecretScanningScanType.FullScan
          })),
          tx
        );

        for (const scan of scans) {
          // eslint-disable-next-line no-await-in-loop
          await queueService.queuePg(QueueJobs.SecretScanningV2FullScan, {
            scanId: scan.id,
            resourceId: scan.resourceId,
            dataSourceId: dataSource.id
          });
        }
      });
    } catch (error) {
      logger.error(error, `Failed to queue full-scan for data source with ID "${dataSource.id}"`);

      if (error instanceof BadRequestError) throw error;

      throw new InternalServerError({ message: `Failed to queue scan: ${(error as Error).message}` });
    }
  };

  await queueService.startPg<QueueName.SecretScanningV2>(
    QueueJobs.SecretScanningV2FullScan,
    async ([job]) => {
      const { scanId, resourceId, dataSourceId } = job.data as TQueueSecretScanningDataSourceFullScan;
      const { retryCount, retryLimit } = job;

      const logDetails = `[scanId=${scanId}] [resourceId=${resourceId}] [dataSourceId=${dataSourceId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      const tempFolder = await createTempFolder();

      const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

      if (!dataSource) throw new Error(`Data source with ID "${dataSourceId}" not found`);

      const resource = await secretScanningV2DAL.resources.findById(resourceId);

      if (!resource) throw new Error(`Resource with ID "${resourceId}" not found`);

      let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;

      try {
        try {
          lock = await keyStore.acquireLock(
            [KeyStorePrefixes.SecretScanningLock(dataSource.id, resource.externalId)],
            60 * 1000 * 5
          );
        } catch (e) {
          throw new Error("Failed to acquire scanning lock.");
        }

        await secretScanningV2DAL.scans.update(
          { id: scanId },
          {
            status: SecretScanningScanStatus.Scanning
          }
        );

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

        let findingsPayload: TFindingsPayload;
        switch (resource.type) {
          case SecretScanningResource.Repository:
          case SecretScanningResource.Project:
            findingsPayload = await scanGitRepositoryAndGetFindings(scanPath, findingsPath, configPath);
            break;
          default:
            throw new Error("Unhandled resource type");
        }

        const allFindings = await secretScanningV2DAL.findings.transaction(async (tx) => {
          let findings: TSecretScanningFindings[] = [];
          if (findingsPayload.length) {
            findings = await secretScanningV2DAL.findings.upsert(
              findingsPayload.map((finding) => ({
                ...finding,
                projectId: dataSource.projectId,
                dataSourceName: dataSource.name,
                dataSourceType: dataSource.type,
                resourceName: resource.name,
                resourceType: resource.type,
                scanId
              })),
              ["projectId", "fingerprint"],
              tx,
              ["resourceName", "dataSourceName"]
            );
          }

          await secretScanningV2DAL.scans.update(
            { id: scanId },
            {
              status: SecretScanningScanStatus.Completed,
              statusMessage: null
            }
          );

          return findings;
        });

        const newFindings = allFindings.filter((finding) => finding.scanId === scanId);

        if (newFindings.length) {
          await queueService.queuePg(QueueJobs.SecretScanningV2SendNotification, {
            status: SecretScanningScanStatus.Completed,
            resourceName: resource.name,
            isDiffScan: false,
            dataSource,
            numberOfSecrets: newFindings.length,
            scanId
          });
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
              dataSourceType: dataSource.type,
              resourceId: resource.id,
              resourceType: resource.type,
              scanId,
              scanStatus: SecretScanningScanStatus.Completed,
              scanType: SecretScanningScanType.FullScan,
              numberOfSecretsDetected: findingsPayload.length
            }
          }
        });

        logger.info(`secretScanningV2Queue: Full Scan Complete ${logDetails} findings=[${findingsPayload.length}]`);
      } catch (error) {
        if (retryCount === retryLimit) {
          const errorMessage = parseScanErrorMessage(error);

          await secretScanningV2DAL.scans.update(
            { id: scanId },
            {
              status: SecretScanningScanStatus.Failed,
              statusMessage: errorMessage
            }
          );

          await queueService.queuePg(QueueJobs.SecretScanningV2SendNotification, {
            status: SecretScanningScanStatus.Failed,
            resourceName: resource.name,
            dataSource,
            errorMessage
          });

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
                dataSourceType: dataSource.type,
                resourceId: resource.id,
                resourceType: resource.type,
                scanId,
                scanStatus: SecretScanningScanStatus.Failed,
                scanType: SecretScanningScanType.FullScan
              }
            }
          });
        }

        logger.error(error, `secretScanningV2Queue: Full Scan Failed ${logDetails}`);
        throw error;
      } finally {
        await deleteTempFolder(tempFolder);
        await lock?.release();
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  const queueResourceDiffScan = async ({
    payload,
    dataSourceId,
    dataSourceType
  }: Pick<TQueueSecretScanningResourceDiffScan, "payload" | "dataSourceId" | "dataSourceType">) => {
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
            type: SecretScanningScanType.DiffScan
          },
          tx
        );

        return {
          resourceId: resource.id,
          scanId: scan.id
        };
      });

      await queueService.queuePg(QueueJobs.SecretScanningV2DiffScan, {
        payload,
        dataSourceId,
        dataSourceType,
        scanId,
        resourceId
      });
    } catch (error) {
      logger.error(
        error,
        `secretScanningV2Queue: Failed to queue diff scan [dataSourceId=${dataSourceId}] [resourceExternalId=${resourcePayload.externalId}]`
      );
    }
  };

  await queueService.startPg<QueueName.SecretScanningV2>(
    QueueJobs.SecretScanningV2DiffScan,
    async ([job]) => {
      const { payload, dataSourceId, resourceId, scanId } = job.data as TQueueSecretScanningResourceDiffScan;
      const { retryCount, retryLimit } = job;

      const logDetails = `[dataSourceId=${dataSourceId}] [scanId=${scanId}] [resourceId=${resourceId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

      if (!dataSource) throw new Error(`Data source with ID "${dataSourceId}" not found`);

      const resource = await secretScanningV2DAL.resources.findById(resourceId);

      if (!resource) throw new Error(`Resource with ID "${resourceId}" not found`);

      const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type as SecretScanningDataSource]({
        kmsService,
        appConnectionDAL
      });

      const tempFolder = await createTempFolder();

      try {
        await secretScanningV2DAL.scans.update(
          { id: scanId },
          {
            status: SecretScanningScanStatus.Scanning
          }
        );

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

        const allFindings = await secretScanningV2DAL.findings.transaction(async (tx) => {
          let findings: TSecretScanningFindings[] = [];

          if (findingsPayload.length) {
            findings = await secretScanningV2DAL.findings.upsert(
              findingsPayload.map((finding) => ({
                ...finding,
                projectId: dataSource.projectId,
                dataSourceName: dataSource.name,
                dataSourceType: dataSource.type,
                resourceName: resource.name,
                resourceType: resource.type,
                scanId
              })),
              ["projectId", "fingerprint"],
              tx,
              ["resourceName", "dataSourceName"]
            );
          }

          await secretScanningV2DAL.scans.update(
            { id: scanId },
            {
              status: SecretScanningScanStatus.Completed
            }
          );

          return findings;
        });

        const newFindings = allFindings.filter((finding) => finding.scanId === scanId);

        if (newFindings.length) {
          const finding = newFindings[0] as TSecretScanningFinding;
          await queueService.queuePg(QueueJobs.SecretScanningV2SendNotification, {
            status: SecretScanningScanStatus.Completed,
            resourceName: resource.name,
            isDiffScan: true,
            dataSource,
            numberOfSecrets: newFindings.length,
            scanId,
            authorName: finding?.details?.author,
            authorEmail: finding?.details?.email
          });
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
              dataSourceType: dataSource.type,
              resourceId,
              resourceType: resource.type,
              scanId,
              scanStatus: SecretScanningScanStatus.Completed,
              scanType: SecretScanningScanType.DiffScan,
              numberOfSecretsDetected: findingsPayload.length
            }
          }
        });

        logger.info(`secretScanningV2Queue: Diff Scan Complete ${logDetails}`);
      } catch (error) {
        if (retryCount === retryLimit) {
          const errorMessage = parseScanErrorMessage(error);

          await secretScanningV2DAL.scans.update(
            { id: scanId },
            {
              status: SecretScanningScanStatus.Failed,
              statusMessage: errorMessage
            }
          );

          await queueService.queuePg(QueueJobs.SecretScanningV2SendNotification, {
            status: SecretScanningScanStatus.Failed,
            resourceName: resource.name,
            dataSource,
            errorMessage
          });

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
                dataSourceType: dataSource.type,
                resourceId: resource.id,
                resourceType: resource.type,
                scanId,
                scanStatus: SecretScanningScanStatus.Failed,
                scanType: SecretScanningScanType.DiffScan
              }
            }
          });
        }

        logger.error(error, `secretScanningV2Queue: Diff Scan Failed ${logDetails}`);
        throw error;
      } finally {
        await deleteTempFolder(tempFolder);
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  await queueService.startPg<QueueName.SecretScanningV2>(
    QueueJobs.SecretScanningV2SendNotification,
    async ([job]) => {
      const { dataSource, resourceName, ...payload } = job.data as TQueueSecretScanningSendNotification;

      const appCfg = getConfig();

      if (!appCfg.isSmtpConfigured) return;

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
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  return {
    queueDataSourceFullScan,
    queueResourceDiffScan
  };
};
