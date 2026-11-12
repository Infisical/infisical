/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
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
  TIntuneRevocationRequest,
  TIntuneRevocationResult,
  TMicrosoftIntuneConnectionCredentials
} from "@app/services/app-connection/microsoft-intune";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

const REVOCATION_SYNC_CRON_SCHEDULE = "*/15 * * * *";
const HANDLER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_TENANT = 10;

const IntuneRevocationErrorCode = {
  None: "0",
  NonRetryableServiceException: "4000"
} as const;

type TTenantConnection = { id: string; orgId: string; credentials: TMicrosoftIntuneConnectionCredentials };

type TMatchedCertificate = { id: string; serialNumber: string; status: string; projectId: string };

type TScepIntuneRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  certificateDAL: Pick<TCertificateDALFactory, "findScepIssuedCertsByOrgsAndSerials">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateService: Pick<TCertificateServiceFactory, "revokeCertAsPlatform" | "rebuildCrlsAfterPlatformRevocations">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TScepIntuneRevocationSyncQueueFactory = ReturnType<typeof scepIntuneRevocationSyncQueueFactory>;

const errorMessageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const scepIntuneRevocationSyncQueueFactory = ({
  cronJob,
  appConnectionDAL,
  kmsService,
  projectDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateService,
  auditLogService
}: TScepIntuneRevocationSyncQueueFactoryDep) => {
  const appCfg = getConfig();

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
          `scep-intune-revocation-sync: connection could not reach Intune, trying the next one [connectionId=${id}] [error=${errorMessageOf(err)}]`
        );
      }
    }
    throw lastError;
  };

  const createIssuerReader = () => {
    const decryptorsByProjectId = new Map<string, (args: { cipherTextBlob: Buffer }) => Promise<Buffer>>();

    return async (certificate: TMatchedCertificate) => {
      const certificateBody = await certificateBodyDAL.findOne({ certId: certificate.id });
      if (!certificateBody) return null;

      let decryptor = decryptorsByProjectId.get(certificate.projectId);
      if (!decryptor) {
        const kmsId = await getProjectKmsCertificateKeyId({ projectId: certificate.projectId, projectDAL, kmsService });
        decryptor = await kmsService.decryptWithKmsKey({ kmsId });
        decryptorsByProjectId.set(certificate.projectId, decryptor);
      }

      const certificateDer = await decryptor({ cipherTextBlob: certificateBody.encryptedCertificate });
      return new x509.X509Certificate(new Uint8Array(certificateDer)).issuer;
    };
  };

  const revokeMatchedCertificate = async (certificateId: string) => {
    const revocation = await certificateService.revokeCertAsPlatform({
      certificateId,
      revocationReason: CrlReason.UNSPECIFIED,
      deferCrlRebuild: true
    });
    if (revocation.outcome !== PlatformRevocationOutcome.Revoked) return revocation;

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
    return revocation;
  };

  const handleRevocationRequest = async ({
    tenantId,
    request,
    candidates,
    readIssuer,
    revokedCaIds
  }: {
    tenantId: string;
    request: TIntuneRevocationRequest;
    candidates: TMatchedCertificate[];
    readIssuer: (certificate: TMatchedCertificate) => Promise<string | null>;
    revokedCaIds: string[];
  }): Promise<TIntuneRevocationResult | null> => {
    const logContext = `[tenantId=${tenantId}] [serial=${request.serialNumber}] [issuer=${request.issuerName ?? ""}]`;

    try {
      const matches: TMatchedCertificate[] = [];
      for (const candidate of candidates) {
        if (!request.issuerName || (await readIssuer(candidate)) === request.issuerName) matches.push(candidate);
      }

      if (matches.length === 0) {
        logger.info(
          `scep-intune-revocation-sync: no matching certificate, leaving the request for its issuer ${logContext}`
        );
        return null;
      }

      let notRevocableReason: string | undefined;
      for (const certificate of matches) {
        if (certificate.status !== CertStatus.REVOKED) {
          const revocation = await revokeMatchedCertificate(certificate.id);
          if (revocation.outcome === PlatformRevocationOutcome.Revoked) revokedCaIds.push(revocation.ca.id);
          if (revocation.outcome === PlatformRevocationOutcome.NotRevocable) notRevocableReason = revocation.reason;
        }
      }

      if (notRevocableReason) {
        logger.warn(
          `scep-intune-revocation-sync: certificate cannot be revoked ${logContext} [reason=${notRevocableReason}]`
        );
        return {
          requestContext: request.requestContext,
          succeeded: false,
          errorCode: IntuneRevocationErrorCode.NonRetryableServiceException,
          errorMessage: notRevocableReason
        };
      }

      return {
        requestContext: request.requestContext,
        succeeded: true,
        errorCode: IntuneRevocationErrorCode.None,
        errorMessage: null
      };
    } catch (err) {
      logger.error(
        `scep-intune-revocation-sync: failed to revoke certificate, retrying on a later run ${logContext} [error=${errorMessageOf(err)}]`
      );
      return null;
    }
  };

  const syncTenant = async (tenantId: string, connections: TTenantConnection[]) => {
    const { serviceUri, intuneAccessToken } = await getTenantAccess(connections);
    const orgIds = [...new Set(connections.map((connection) => connection.orgId))];
    const readIssuer = createIssuerReader();

    for (let batch = 0; batch < MAX_BATCHES_PER_TENANT; batch += 1) {
      const revocationRequests = await intuneDownloadRevocationRequests({ intuneAccessToken, serviceUri });
      if (revocationRequests.length === 0) return;

      const serialNumbers = [...new Set(revocationRequests.map((request) => request.serialNumber.toLowerCase()))];
      const certificates = await certificateDAL.findScepIssuedCertsByOrgsAndSerials(orgIds, serialNumbers);

      const results: TIntuneRevocationResult[] = [];
      const revokedCaIds: string[] = [];
      for (const request of revocationRequests) {
        const result = await handleRevocationRequest({
          tenantId,
          request,
          candidates: certificates.filter(
            (certificate) => certificate.serialNumber.toLowerCase() === request.serialNumber.toLowerCase()
          ),
          readIssuer,
          revokedCaIds
        });
        if (result) results.push(result);
      }

      try {
        await certificateService.rebuildCrlsAfterPlatformRevocations(revokedCaIds);
      } catch (err) {
        logger.error(
          `scep-intune-revocation-sync: failed to rebuild CRLs, the hourly CRL rebuild job will retry [tenantId=${tenantId}] [error=${errorMessageOf(err)}]`
        );
      }

      if (results.length > 0) {
        await intuneUploadRevocationResults({ intuneAccessToken, serviceUri, results });
      }

      logger.info(
        `scep-intune-revocation-sync: batch done [tenantId=${tenantId}] [requests=${revocationRequests.length}] [answered=${results.length}] [revoked=${revokedCaIds.length}]`
      );

      if (results.length === 0 || revocationRequests.length < INTUNE_MAX_REVOCATION_REQUESTS) return;
    }

    logger.warn(
      `scep-intune-revocation-sync: stopped at the batch limit, the remaining requests are processed on the next run [tenantId=${tenantId}] [maxBatches=${MAX_BATCHES_PER_TENANT}]`
    );
  };

  const groupConnectionsByTenant = async () => {
    const connections = await appConnectionDAL.find({ app: AppConnection.MicrosoftIntune });

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
          { id: connection.id, orgId: connection.orgId, credentials }
        ]);
      } catch (err) {
        logger.error(
          `scep-intune-revocation-sync: failed to read connection credentials [connectionId=${connection.id}] [error=${errorMessageOf(err)}]`
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
        const connectionsByTenant = await groupConnectionsByTenant();
        for (const [tenantId, connections] of connectionsByTenant) {
          try {
            await syncTenant(tenantId, connections);
          } catch (err) {
            logger.error(
              `scep-intune-revocation-sync: tenant failed [tenantId=${tenantId}] [error=${errorMessageOf(err)}]`
            );
          }
        }
      }
    });
  };

  return { init };
};
