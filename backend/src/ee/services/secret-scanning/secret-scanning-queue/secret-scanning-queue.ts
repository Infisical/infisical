import { InternalServerError } from "@app/lib/errors";
import { TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";

import { TSecretScanningDALFactory } from "../secret-scanning-dal";
import { TScanFullRepoEventPayload, TScanPushEventPayload } from "./secret-scanning-queue-types";

type TSecretScanningQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  secretScanningDAL: TSecretScanningDALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgMembershipDAL: Pick<TOrgDALFactory, "findMembership">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TSecretScanningQueueFactory = ReturnType<typeof secretScanningQueueFactory>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const secretScanningQueueFactory = (_props: TSecretScanningQueueFactoryDep) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startFullRepoScan = async (_payload: TScanFullRepoEventPayload) => {
    throw new InternalServerError({
      message: "Secret Scanning V1 has been deprecated. Please migrate to Secret Scanning V2"
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startPushEventScan = async (_payload: TScanPushEventPayload) => {
    throw new InternalServerError({
      message: "Secret Scanning V1 has been deprecated. Please migrate to Secret Scanning V2"
    });
  };

  return { startFullRepoScan, startPushEventScan };
};
