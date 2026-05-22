/* eslint-disable no-await-in-loop */
import { TableName } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { revocationReasonToCrlCode } from "@app/services/certificate/certificate-fns";
import { CertStatus, CrlReason } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { createDigiCertApiClient } from "./digicert-api-client";
import {
  castDbEntryToDigiCertCertificateAuthority,
  getDigiCertClientCredentials
} from "./digicert-certificate-authority-fns";

// 03:00 UTC: off-peak and one hour after the existing daily certificate-cleanup cron (02:00 UTC).
const REVOCATION_SYNC_CRON_SCHEDULE = "0 3 * * *";
const REVOCATION_LOOKBACK_SECONDS = 24 * 60 * 60;
const ORDER_ID_LOOKUP_CHUNK_SIZE = 500;
const HANDLER_TIMEOUT_MS = 30 * 60 * 1000;

type TDigiCertRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findWithAssociatedCa">;
  certificateDAL: Pick<TCertificateDALFactory, "findActiveDigiCertCertsByOrderIds" | "updateById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TDigiCertRevocationSyncQueueFactory = ReturnType<typeof digicertRevocationSyncQueueFactory>;

export const digicertRevocationSyncQueueFactory = ({
  cronJob,
  certificateAuthorityDAL,
  certificateDAL,
  appConnectionDAL,
  kmsService,
  auditLogService
}: TDigiCertRevocationSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const markCertificateRevokedLocally = async (cert: {
    id: string;
    commonName: string;
    serialNumber: string;
    projectId: string;
  }) => {
    await certificateDAL.updateById(cert.id, {
      status: CertStatus.REVOKED,
      revokedAt: new Date(),
      revocationReason: revocationReasonToCrlCode(CrlReason.UNSPECIFIED)
    });

    await auditLogService.createAuditLog({
      projectId: cert.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.REVOKE_CERT,
        metadata: {
          certId: cert.id,
          cn: cert.commonName,
          serialNumber: cert.serialNumber
        }
      }
    });
  };

  const syncRevocationsForCertificateAuthority = async (
    caRow: Awaited<ReturnType<typeof certificateAuthorityDAL.findWithAssociatedCa>>[number]
  ) => {
    const ca = castDbEntryToDigiCertCertificateAuthority(caRow);
    const { apiKey, baseUrl } = await getDigiCertClientCredentials(
      ca.configuration.appConnectionId,
      appConnectionDAL,
      kmsService
    );
    const digicertClient = createDigiCertApiClient(apiKey, baseUrl);

    const { orders: recentStatusChanges = [] } = await digicertClient.listOrderStatusChanges({
      seconds: REVOCATION_LOOKBACK_SECONDS
    });
    const upstreamRevokedOrderIds = recentStatusChanges
      .filter((change) => change.status === "revoked")
      .map((change) => change.order_id);

    if (upstreamRevokedOrderIds.length === 0) {
      logger.info(`digicert-revocation-sync: CA done [caId=${ca.id}] [upstreamRevoked=0] [reconciled=0]`);
      return;
    }

    let reconciledCount = 0;
    for (let i = 0; i < upstreamRevokedOrderIds.length; i += ORDER_ID_LOOKUP_CHUNK_SIZE) {
      const orderIdChunk = upstreamRevokedOrderIds.slice(i, i + ORDER_ID_LOOKUP_CHUNK_SIZE);
      const certsToReconcile = await certificateDAL.findActiveDigiCertCertsByOrderIds(ca.id, orderIdChunk);

      for (const cert of certsToReconcile) {
        try {
          await markCertificateRevokedLocally(cert);
          reconciledCount += 1;
          logger.info(
            `digicert-revocation-sync: marked revoked [caId=${ca.id}] [certId=${cert.id}] [serial=${cert.serialNumber}]`
          );
        } catch (err) {
          logger.error(
            err,
            `digicert-revocation-sync: failed to mark cert revoked [caId=${ca.id}] [certId=${cert.id}]`
          );
        }
      }
    }

    logger.info(
      `digicert-revocation-sync: CA done [caId=${ca.id}] [upstreamRevoked=${upstreamRevokedOrderIds.length}] [reconciled=${reconciledCount}]`
    );
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.DigiCertRevocationSync,
      pattern: REVOCATION_SYNC_CRON_SCHEDULE,
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handlerTimeoutMs: HANDLER_TIMEOUT_MS,
      leaseDurationMs: HANDLER_TIMEOUT_MS,
      handler: async () => {
        logger.info("digicert-revocation-sync: started");

        const digicertCertificateAuthorities = await certificateAuthorityDAL.findWithAssociatedCa({
          [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.DIGICERT,
          [`${TableName.CertificateAuthority}.status` as "status"]: CaStatus.ACTIVE
        });

        let succeededCaCount = 0;
        let failedCaCount = 0;
        for (const caRow of digicertCertificateAuthorities) {
          try {
            await syncRevocationsForCertificateAuthority(caRow);
            succeededCaCount += 1;
          } catch (err) {
            failedCaCount += 1;
            logger.error(err, `digicert-revocation-sync: CA failed [caId=${caRow.id}]`);
          }
        }

        logger.info(
          `digicert-revocation-sync: completed [casScanned=${digicertCertificateAuthorities.length}] [succeeded=${succeededCaCount}] [failed=${failedCaCount}]`
        );
      }
    });
  };

  return { init };
};
