/* eslint-disable no-await-in-loop */
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import {
  discoverPkiConnectorServiceUri,
  getMicrosoftEntraToken,
  INTUNE_MAX_REVOCATION_REQUESTS,
  intuneDownloadRevocationRequests,
  intuneUploadRevocationResults,
  MicrosoftEntraTokenResource,
  TIntuneRevocationResult,
  TMicrosoftIntuneConnectionCredentials
} from "@app/services/app-connection/microsoft-intune";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { CertStatus, CrlReason } from "@app/services/certificate/certificate-types";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { ScepChallengeType } from "./challenge/scep-challenge-types";

const REVOCATION_SYNC_CRON_SCHEDULE = "*/15 * * * *";
const HANDLER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_TENANT = 10;

const IntuneRevocationErrorCode = {
  None: "0",
  NonRetryableServiceException: "4000"
} as const;

type TScepIntuneRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "find">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  certificateDAL: Pick<TCertificateDALFactory, "findScepCertsByValidationConnectionsAndSerials">;
  certificateService: Pick<TCertificateServiceFactory, "revokeCertAsPlatform">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

type TTenantConnection = { id: string; credentials: TMicrosoftIntuneConnectionCredentials };

export type TScepIntuneRevocationSyncQueueFactory = ReturnType<typeof scepIntuneRevocationSyncQueueFactory>;

export const scepIntuneRevocationSyncQueueFactory = ({
  cronJob,
  scepEnrollmentConfigDAL,
  appConnectionDAL,
  kmsService,
  certificateDAL,
  certificateService,
  auditLogService
}: TScepIntuneRevocationSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const revokeCertificate = async (certificateId: string) => {
    const revocation = await certificateService.revokeCertAsPlatform({
      certificateId,
      revocationReason: CrlReason.UNSPECIFIED
    });
    if (!revocation) return;
    const { cert, ca, applicationName } = revocation;

    await auditLogService.createAuditLog({
      projectId: ca.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.REVOKE_CERT,
        metadata: {
          certId: cert.id,
          cn: cert.commonName,
          serialNumber: cert.serialNumber,
          applicationId: cert.applicationId,
          applicationName,
          revocationReason: CrlReason.UNSPECIFIED
        }
      }
    });
  };

  const getTenantAccess = async (connections: TTenantConnection[]) => {
    let lastError: unknown;
    for (const { id, credentials } of connections) {
      try {
        const graphToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Graph);
        const serviceUri = await discoverPkiConnectorServiceUri(graphToken.accessToken);
        const { accessToken: intuneAccessToken } = await getMicrosoftEntraToken(
          credentials,
          MicrosoftEntraTokenResource.Intune
        );
        return { serviceUri, intuneAccessToken };
      } catch (err) {
        lastError = err;
        logger.warn(
          `scep-intune-revocation-sync: connection could not reach Intune, trying the next one [connectionId=${id}] [error=${err instanceof Error ? err.message : String(err)}]`
        );
      }
    }
    throw lastError;
  };

  const syncTenant = async (tenantId: string, connections: TTenantConnection[]) => {
    const { serviceUri, intuneAccessToken } = await getTenantAccess(connections);

    for (let batch = 0; batch < MAX_BATCHES_PER_TENANT; batch += 1) {
      const revocationRequests = await intuneDownloadRevocationRequests({ intuneAccessToken, serviceUri });
      if (revocationRequests.length === 0) return;

      const serialNumbers = [...new Set(revocationRequests.map((request) => request.serialNumber.toLowerCase()))];
      const certificates = await certificateDAL.findScepCertsByValidationConnectionsAndSerials(
        connections.map((connection) => connection.id),
        serialNumbers
      );

      const results: TIntuneRevocationResult[] = [];
      for (const request of revocationRequests) {
        const matches = certificates.filter(
          (certificate) => certificate.serialNumber.toLowerCase() === request.serialNumber.toLowerCase()
        );

        if (matches.length === 0) {
          logger.info(
            `scep-intune-revocation-sync: no matching certificate, leaving the request for its issuer [tenantId=${tenantId}] [serial=${request.serialNumber}] [issuer=${request.issuerName ?? ""}]`
          );
          // eslint-disable-next-line no-continue
          continue;
        }

        try {
          for (const certificate of matches) {
            if (certificate.status !== CertStatus.REVOKED) {
              await revokeCertificate(certificate.id);
            }
          }
          results.push({
            requestContext: request.requestContext,
            succeeded: true,
            errorCode: IntuneRevocationErrorCode.None,
            errorMessage: null
          });
        } catch (err) {
          const isPermanent = err instanceof BadRequestError || err instanceof NotFoundError;
          logger.error(
            `scep-intune-revocation-sync: failed to revoke certificate${isPermanent ? "" : ", retrying on the next run"} [tenantId=${tenantId}] [serial=${request.serialNumber}] [error=${err instanceof Error ? err.message : String(err)}]`
          );
          if (isPermanent) {
            results.push({
              requestContext: request.requestContext,
              succeeded: false,
              errorCode: IntuneRevocationErrorCode.NonRetryableServiceException,
              errorMessage: err.message
            });
          }
        }
      }

      if (results.length > 0) {
        await intuneUploadRevocationResults({ intuneAccessToken, serviceUri, results });
      }

      logger.info(
        `scep-intune-revocation-sync: batch done [tenantId=${tenantId}] [requests=${revocationRequests.length}] [answered=${results.length}] [revoked=${results.filter((result) => result.succeeded).length}]`
      );

      if (results.length === 0 || revocationRequests.length < INTUNE_MAX_REVOCATION_REQUESTS) return;
    }
  };

  const groupConnectionsByTenant = async (connectionIds: string[]) => {
    const connections = await appConnectionDAL.find({
      $in: { id: connectionIds },
      app: AppConnection.MicrosoftIntune
    });

    const connectionsByTenant = new Map<string, TTenantConnection[]>();
    for (const connection of connections) {
      try {
        const credentials = (await decryptAppConnectionCredentials({
          orgId: connection.orgId,
          projectId: connection.projectId,
          encryptedCredentials: connection.encryptedCredentials,
          kmsService
        })) as TMicrosoftIntuneConnectionCredentials;

        const tenantId = credentials.tenantId.toLowerCase();
        connectionsByTenant.set(tenantId, [
          ...(connectionsByTenant.get(tenantId) ?? []),
          { id: connection.id, credentials }
        ]);
      } catch (err) {
        logger.error(
          `scep-intune-revocation-sync: failed to read connection credentials [connectionId=${connection.id}] [error=${err instanceof Error ? err.message : String(err)}]`
        );
      }
    }

    return connectionsByTenant;
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.ScepIntuneRevocationSync,
      pattern: REVOCATION_SYNC_CRON_SCHEDULE,
      runHashTtlS: 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handlerTimeoutMs: HANDLER_TIMEOUT_MS,
      leaseDurationMs: HANDLER_TIMEOUT_MS,
      handler: async () => {
        const intuneScepConfigs = await scepEnrollmentConfigDAL.find({
          challengeType: ScepChallengeType.MICROSOFT_INTUNE
        });
        const connectionIds = [
          ...new Set(intuneScepConfigs.map((config) => config.validationConnectionId).filter(Boolean))
        ] as string[];

        const connectionsByTenant = await groupConnectionsByTenant(connectionIds);
        for (const [tenantId, connections] of connectionsByTenant) {
          try {
            await syncTenant(tenantId, connections);
          } catch (err) {
            logger.error(
              `scep-intune-revocation-sync: tenant failed [tenantId=${tenantId}] [error=${err instanceof Error ? err.message : String(err)}]`
            );
          }
        }
      }
    });
  };

  return { init };
};
