/* eslint-disable no-await-in-loop */

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TPkiAlertHistoryDALFactory } from "./pki-alert-history-dal";
import { TPkiAlertV2DALFactory } from "./pki-alert-v2-dal";
import { parseTimeToDays, parseTimeToPostgresInterval } from "./pki-alert-v2-filter-utils";
import { TPkiAlertV2ServiceFactory } from "./pki-alert-v2-service";
import { CertificateOrigin, PkiAlertEventType, TPkiFilterRule } from "./pki-alert-v2-types";

type TPkiAlertV2QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pkiAlertV2Service: Pick<TPkiAlertV2ServiceFactory, "sendAlertNotifications">;
  pkiAlertV2DAL: Pick<TPkiAlertV2DALFactory, "findByProjectId" | "findMatchingCertificates" | "getDistinctProjectIds">;
  pkiAlertHistoryDAL: Pick<TPkiAlertHistoryDALFactory, "findRecentlyAlertedCertificates">;
};

export type TPkiAlertV2QueueServiceFactory = ReturnType<typeof pkiAlertV2QueueServiceFactory>;

export const pkiAlertV2QueueServiceFactory = ({
  queueService,
  pkiAlertV2Service,
  pkiAlertV2DAL,
  pkiAlertHistoryDAL
}: TPkiAlertV2QueueServiceFactoryDep) => {
  const appCfg = getConfig();
  const calculateDeduplicationWindow = (alertBefore: string): number => {
    const alertDays = parseTimeToDays(alertBefore);

    if (alertDays === 0) {
      return 24;
    }

    if (alertDays <= 1) {
      return 8;
    }
    if (alertDays <= 7) {
      return 24;
    }
    if (alertDays <= 30) {
      return 48;
    }
    if (alertDays <= 90) {
      return 168;
    }
    return 720;
  };

  const getAllProjectsWithAlerts = async (): Promise<string[]> => {
    try {
      const projectIds = await pkiAlertV2DAL.getDistinctProjectIds({ enabled: true });

      logger.info(`Found ${projectIds.length} projects with PKI alerts`);
      return projectIds;
    } catch (error) {
      logger.error(error, "Failed to get projects with alerts");
      return [];
    }
  };

  const evaluateAlert = async (
    alert: {
      id: string;
      name: string;
      eventType: string;
      alertBefore: string;
      filters: TPkiFilterRule[];
    },
    projectId: string
  ): Promise<{ shouldNotify: boolean; certificateIds: string[] }> => {
    if (alert.eventType !== PkiAlertEventType.EXPIRATION) {
      return { shouldNotify: false, certificateIds: [] };
    }

    try {
      const result = await pkiAlertV2DAL.findMatchingCertificates(projectId, alert.filters, {
        limit: 1000,
        alertBefore: parseTimeToPostgresInterval(alert.alertBefore),
        showCurrentMatches: true
      });

      if (result.certificates.length === 0) {
        return { shouldNotify: false, certificateIds: [] };
      }

      const allCertificateIds = result.certificates
        .filter((cert) => cert.enrollmentType !== CertificateOrigin.CA)
        .map((cert) => cert.id);

      const deduplicationHours = calculateDeduplicationWindow(alert.alertBefore);
      const recentlyAlertedIds = await pkiAlertHistoryDAL.findRecentlyAlertedCertificates(
        alert.id,
        allCertificateIds,
        deduplicationHours
      );

      const certificateIds = allCertificateIds.filter((certId) => !recentlyAlertedIds.includes(certId));

      if (certificateIds.length === 0) {
        logger.debug(
          `All ${allCertificateIds.length} matching certificates for alert ${alert.id} were already alerted within the last ${deduplicationHours} hours`
        );
        return { shouldNotify: false, certificateIds: [] };
      }

      logger.debug(
        `Alert ${alert.id}: Found ${allCertificateIds.length} expiring certificates, ${recentlyAlertedIds.length} already alerted recently, ${certificateIds.length} new to alert`
      );

      return {
        shouldNotify: true,
        certificateIds
      };
    } catch (error) {
      logger.error(error, `Failed to evaluate alert ${alert.id}`);
      return { shouldNotify: false, certificateIds: [] };
    }
  };

  const processProjectAlerts = async (
    projectId: string
  ): Promise<{ alertsProcessed: number; notificationsSent: number }> => {
    logger.info(`Processing alerts for project: ${projectId}`);

    const alerts = await pkiAlertV2DAL.findByProjectId(projectId, {
      enabled: true,
      limit: 1000
    });

    let alertsProcessed = 0;
    let notificationsSent = 0;

    for (const alert of alerts) {
      const typedAlert = alert as {
        id: string;
        name: string;
        eventType: string;
        alertBefore: string;
        filters: TPkiFilterRule[];
      };
      try {
        const { shouldNotify, certificateIds } = await evaluateAlert(typedAlert, projectId);

        if (shouldNotify && certificateIds.length > 0) {
          await pkiAlertV2Service.sendAlertNotifications(typedAlert.id, certificateIds);
          notificationsSent += 1;
          logger.info(
            `Sent notification for alert ${typedAlert.id} (${typedAlert.name}) with ${certificateIds.length} certificates`
          );
        }

        alertsProcessed += 1;
      } catch (error) {
        logger.error(error, `Failed to process alert ${typedAlert.id} (${typedAlert.name})`);
      }
    }

    logger.info(
      `Completed processing ${alertsProcessed} alerts for project ${projectId}, sent ${notificationsSent} notifications`
    );

    return { alertsProcessed, notificationsSent };
  };

  const processDailyAlerts = async () => {
    logger.info("Starting daily PKI alert processing...");

    const allProjects = await getAllProjectsWithAlerts();

    let totalAlertsProcessed = 0;
    let totalNotificationsSent = 0;

    for (const projectId of allProjects) {
      try {
        const { alertsProcessed, notificationsSent } = await processProjectAlerts(projectId);
        totalAlertsProcessed += alertsProcessed;
        totalNotificationsSent += notificationsSent;
      } catch (error) {
        logger.error(error, `Failed to process alerts for project ${projectId}`);
      }
    }

    logger.info(
      `Daily PKI alert processing completed. Processed ${totalAlertsProcessed} alerts, sent ${totalNotificationsSent} notifications.`
    );
  };

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.startPg<QueueName.DailyPkiAlertV2Processing>(
      QueueJobs.DailyPkiAlertV2Processing,
      async () => {
        try {
          logger.info(`${QueueJobs.DailyPkiAlertV2Processing}: queue task started`);
          await processDailyAlerts();
          logger.info(`${QueueJobs.DailyPkiAlertV2Processing}: queue task completed successfully`);
        } catch (error) {
          logger.error(error, `${QueueJobs.DailyPkiAlertV2Processing}: queue task failed`);
          throw error;
        }
      },
      {
        batchSize: 1,
        workerCount: 1,
        pollingIntervalSeconds: 60
      }
    );

    await queueService.schedulePg(QueueJobs.DailyPkiAlertV2Processing, "0 0 * * *", undefined, { tz: "UTC" });
  };

  return {
    init
  };
};
