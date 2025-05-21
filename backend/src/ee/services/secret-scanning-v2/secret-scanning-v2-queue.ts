import { join } from "path";

import { createTempFolder } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import {
  parseScanErrorMessage,
  scanRepositoryAndGetFindings
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { TSecretScanningV2DALFactory } from "./secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningResource,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "./secret-scanning-v2-enums";
import { SECRET_SCANNING_FACTORY_MAP } from "./secret-scanning-v2-factory";
import { TFindingsPayload, TSecretScanningDataSourceWithConnection } from "./secret-scanning-v2-types";

type TSecretRotationV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretScanningV2QueueServiceFactory = Awaited<ReturnType<typeof secretScanningV2QueueServiceFactory>>;

export const secretScanningV2QueueServiceFactory = async ({
  queueService,
  secretScanningV2DAL,
  projectMembershipDAL,
  projectDAL,
  smtpService,
  kmsService
}: TSecretRotationV2QueueServiceFactoryDep) => {
  const queueDataSourceFullScan = async (dataSource: TSecretScanningDataSourceWithConnection) => {
    try {
      const { type } = dataSource;

      const factory = SECRET_SCANNING_FACTORY_MAP[type]();

      const rawResources = await factory.listRawResources(dataSource);

      await secretScanningV2DAL.resources.transaction(async (tx) => {
        const resources = await secretScanningV2DAL.resources.upsert(
          rawResources.map((rawResource) => ({
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
      throw new InternalServerError({ message: "Failed to queue full-scan." });
    }
  };

  await queueService.startPg<QueueName.SecretScanningV2>(
    QueueJobs.SecretScanningV2FullScan,
    async ([job]) => {
      const { scanId, resourceId, dataSourceId } = job.data;
      const { retryCount, retryLimit } = job;

      const logDetails = `[scanId=${scanId}] [resourceId=${resourceId}] [dataSourceId=${dataSourceId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

      const tempFolder = await createTempFolder();

      try {
        await secretScanningV2DAL.scans.update(
          { id: scanId },
          {
            status: SecretScanningScanStatus.Scanning
          }
        );

        const dataSource = await secretScanningV2DAL.dataSources.findById(dataSourceId);

        if (!dataSource) throw new Error(`Data source with ID "${dataSourceId}" not found`);

        const resource = await secretScanningV2DAL.resources.findById(resourceId);

        if (!resource) throw new Error(`Resource with ID "${resourceId}" not found`);

        let connection: TAppConnection | null = null;
        if (dataSource.connection) connection = await decryptAppConnection(dataSource.connection, kmsService);

        const factory = SECRET_SCANNING_FACTORY_MAP[dataSource.type as SecretScanningDataSource]();

        const findingsPath = join(tempFolder, "findings.json");

        const scanPath = await factory.getScanPath({
          dataSource: {
            ...dataSource,
            connection
          } as TSecretScanningDataSourceWithConnection,
          resourceName: resource.name,
          tempFolder
        });

        let findingsPayload: TFindingsPayload;
        switch (resource.type) {
          case SecretScanningResource.Repository:
            findingsPayload = await scanRepositoryAndGetFindings(scanPath, findingsPath);
            break;
          default:
            throw new Error("Unhandled resource type");
        }

        await secretScanningV2DAL.findings.transaction(async (tx) => {
          await secretScanningV2DAL.findings.insertMany(
            findingsPayload.map((findings) => ({
              ...findings,
              projectId: dataSource.projectId,
              dataSourceName: dataSource.name,
              dataSourceType: dataSource.type,
              resourceName: resource.name,
              resourceType: resource.type,
              scanId
            })),
            tx
          );

          await secretScanningV2DAL.scans.update(
            { id: scanId },
            {
              status: SecretScanningScanStatus.Completed
            }
          );
        });

        // TODO: send notification

        logger.info(
          `secretScanningV2Queue: Scan Complete ${logDetails} inputPath=[${scanPath}] outputPath=[${findingsPath}]`
        );
      } catch (error) {
        await secretScanningV2DAL.scans.update(
          { id: scanId },
          {
            status: SecretScanningScanStatus.Failed,
            statusMessage: parseScanErrorMessage(error)
          }
        );

        // TODO: send error notification

        logger.error(error, `secretScanningV2Queue: Scan Failed ${logDetails}`);
        throw error;
      } finally {
        // await deleteTempFolder(tempFolder);
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  // await queueService.startPg<QueueName.SecretRotationV2>(
  //   QueueJobs.SecretRotationV2SendNotification,
  //   async ([job]) => {
  //     const { secretRotation } = job.data as TSecretRotationSendNotificationJobPayload;
  //     try {
  //       const {
  //         name: rotationName,
  //         type,
  //         projectId,
  //         lastRotationAttemptedAt,
  //         folder,
  //         environment,
  //         id: dataSourceId
  //       } = secretRotation;
  //
  //       logger.info(`secretRotationV2Queue: Sending Status Notification [dataSourceId=${dataSourceId}]`);
  //
  //       const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
  //       const project = await projectDAL.findById(projectId);
  //
  //       const projectAdmins = projectMembers.filter((member) =>
  //         member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
  //       );
  //
  //       const rotationType = SECRET_ROTATION_NAME_MAP[type as SecretRotation];
  //
  //       await smtpService.sendMail({
  //         recipients: projectAdmins.map((member) => member.user.email!).filter(Boolean),
  //         template: SmtpTemplates.SecretRotationFailed,
  //         subjectLine: `Secret Rotation Failed`,
  //         substitutions: {
  //           rotationName,
  //           rotationType,
  //           content: `Your ${rotationType} Rotation failed to rotate during it's scheduled rotation. The last rotation attempt occurred at ${new Date(
  //             lastRotationAttemptedAt
  //           ).toISOString()}. Please check the rotation status in Infisical for more details.`,
  //           secretPath: folder.path,
  //           environment: environment.name,
  //           projectName: project.name,
  //           rotationUrl: encodeURI(`${appCfg.SITE_URL}/secret-manager/${projectId}/secrets/${environment.slug}`)
  //         }
  //       });
  //     } catch (error) {
  //       logger.error(
  //         error,
  //         `secretRotationV2Queue: Failed to Send Status Notification [dataSourceId=${secretRotation.id}]`
  //       );
  //       throw error;
  //     }
  //   },
  //   {
  //     batchSize: 1,
  //     workerCount: 2,
  //     pollingIntervalSeconds: 1
  //   }
  // );

  return {
    queueDataSourceFullScan
  };
};
