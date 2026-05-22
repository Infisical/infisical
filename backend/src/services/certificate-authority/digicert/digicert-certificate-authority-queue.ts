/* eslint-disable no-await-in-loop */
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs } from "@app/queue";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { TCertificateRequestDALFactory } from "../../certificate-request/certificate-request-dal";
import { CaType } from "../certificate-authority-enums";
import { TDigiCertApiClient } from "./digicert-api-client";
import {
  processDigiCertPendingValidationRequest,
  TProcessDigiCertRequestDeps
} from "./digicert-certificate-authority-processor";

const DIGICERT_POLL_CRON_SCHEDULE = "0 * * * *";
const QUEUE_BATCH_SIZE = 50;

type TDigiCertCertificateAuthorityQueueServiceFactoryDep = Omit<
  TProcessDigiCertRequestDeps,
  "certificateRequestDAL"
> & {
  cronJob: TCronJobFactory;
  certificateRequestDAL: Pick<
    TCertificateRequestDALFactory,
    "updateById" | "findPendingValidationByCaType" | "setPendingMessage"
  >;
};

export type TDigiCertCertificateAuthorityQueueServiceFactory = ReturnType<
  typeof digicertCertificateAuthorityQueueServiceFactory
>;

export const digicertCertificateAuthorityQueueServiceFactory = ({
  cronJob,
  ...processorDeps
}: TDigiCertCertificateAuthorityQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    cronJob.register({
      name: CronJobName.DigiCertOrderPolling,
      pattern: DIGICERT_POLL_CRON_SCHEDULE,
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`${QueueJobs.DigiCertOrderPolling}: queue task started`);

        const clientsByCaId = new Map<string, TDigiCertApiClient>();
        let processed = 0;
        let issued = 0;
        let failed = 0;

        let cursor: Date | undefined;
        let hasMore = true;
        while (hasMore) {
          const requests = await processorDeps.certificateRequestDAL.findPendingValidationByCaType(CaType.DIGICERT, {
            limit: QUEUE_BATCH_SIZE,
            afterCreatedAt: cursor
          });

          if (requests.length === 0) break;

          for (const request of requests) {
            processed += 1;
            try {
              const result = await processDigiCertPendingValidationRequest(processorDeps, request, clientsByCaId);
              if (result.status === CertificateRequestStatus.ISSUED) issued += 1;
              if (result.status === CertificateRequestStatus.FAILED) failed += 1;
            } catch (error) {
              logger.error(error, `DigiCert polling iteration failed [certificateRequestId=${request.id}]`);
            }
          }

          cursor = new Date(requests[requests.length - 1].createdAt);
          hasMore = requests.length === QUEUE_BATCH_SIZE;
        }

        logger.info(
          `${QueueJobs.DigiCertOrderPolling}: completed [processed=${processed}] [issued=${issued}] [failed=${failed}]`
        );
      }
    });
  };

  return {
    init
  };
};
