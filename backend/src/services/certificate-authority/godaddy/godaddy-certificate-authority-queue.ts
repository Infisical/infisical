/* eslint-disable no-await-in-loop */
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs } from "@app/queue";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { TCertificateRequestDALFactory } from "../../certificate-request/certificate-request-dal";
import { CaType } from "../certificate-authority-enums";
import { TGoDaddyApiClient } from "./godaddy-api-client";
import {
  processGoDaddyPendingValidationRequest,
  TProcessGoDaddyRequestDeps
} from "./godaddy-certificate-authority-processor";

const GODADDY_POLL_CRON_SCHEDULE = "0 * * * *";
const QUEUE_BATCH_SIZE = 50;

type TGoDaddyCertificateAuthorityQueueServiceFactoryDep = Omit<TProcessGoDaddyRequestDeps, "certificateRequestDAL"> & {
  cronJob: TCronJobFactory;
  certificateRequestDAL: Pick<
    TCertificateRequestDALFactory,
    "updateById" | "findPendingValidationByCaType" | "setPendingMessage"
  >;
};

export type TGoDaddyCertificateAuthorityQueueServiceFactory = ReturnType<
  typeof godaddyCertificateAuthorityQueueServiceFactory
>;

export const godaddyCertificateAuthorityQueueServiceFactory = ({
  cronJob,
  ...processorDeps
}: TGoDaddyCertificateAuthorityQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    cronJob.register({
      name: CronJobName.GoDaddyOrderPolling,
      pattern: GODADDY_POLL_CRON_SCHEDULE,
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`${QueueJobs.GoDaddyOrderPolling}: queue task started`);

        const clientsByCaId = new Map<string, TGoDaddyApiClient>();
        let processed = 0;
        let issued = 0;
        let failed = 0;

        let cursor: Date | undefined;
        let hasMore = true;
        while (hasMore) {
          const requests = await processorDeps.certificateRequestDAL.findPendingValidationByCaType(CaType.GODADDY, {
            limit: QUEUE_BATCH_SIZE,
            afterCreatedAt: cursor
          });

          if (requests.length === 0) break;

          for (const request of requests) {
            processed += 1;
            try {
              const result = await processGoDaddyPendingValidationRequest(processorDeps, request, clientsByCaId);
              if (result.status === CertificateRequestStatus.ISSUED) issued += 1;
              if (result.status === CertificateRequestStatus.FAILED) failed += 1;
            } catch (error) {
              logger.error(error, `GoDaddy polling iteration failed [certificateRequestId=${request.id}]`);
            }
          }

          cursor = new Date(requests[requests.length - 1].createdAt);
          hasMore = requests.length === QUEUE_BATCH_SIZE;
        }

        logger.info(
          `${QueueJobs.GoDaddyOrderPolling}: completed [processed=${processed}] [issued=${issued}] [failed=${failed}]`
        );
      }
    });
  };

  return {
    init
  };
};
