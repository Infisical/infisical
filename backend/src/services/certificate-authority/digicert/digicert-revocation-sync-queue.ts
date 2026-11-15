/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import pLimit from "p-limit";

import { TableName } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { OcspCertStatus } from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { DigiCertExternalMetadataSchema } from "@app/services/certificate-common/external-metadata-schemas";
import {
  CertificateApplicationAlertEvent,
  TCertificateAlertEventEmitter
} from "@app/services/certificate/certificate-alert-events";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { parsePemCertificateChain, revocationReasonToCrlCode } from "@app/services/certificate/certificate-fns";
import { getCertificateOcspStatus } from "@app/services/certificate/certificate-ocsp-client";
import { CertStatus, CrlReason } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiAlertV2QueueServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-queue";
import { PkiAlertEventType } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { createDigiCertApiClient, TDigiCertApiClient } from "./digicert-api-client";
import {
  castDbEntryToDigiCertCertificateAuthority,
  getDigiCertClientCredentials
} from "./digicert-certificate-authority-fns";
import { extractLeafAndChain } from "./digicert-certificate-authority-shared";

// 03:00 UTC: off-peak and one hour after the existing daily certificate-cleanup cron (02:00 UTC).
const REVOCATION_SYNC_CRON_SCHEDULE = "0 3 * * *";
const REVOCATION_LOOKBACK_SECONDS = 6 * 24 * 60 * 60;
const ORDER_ID_LOOKUP_CHUNK_SIZE = 500;
const HANDLER_TIMEOUT_MS = 30 * 60 * 1000;
const OCSP_CHECK_CONCURRENCY = 4;

type TDigiCertRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findWithAssociatedCa">;
  certificateDAL: Pick<
    TCertificateDALFactory,
    "findActiveDigiCertCertsByOrderIds" | "findActiveDigiCertCertsByCaId" | "updateById"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pkiAlertV2Queue?: Pick<TPkiAlertV2QueueServiceFactory, "queueCertificateEvent">;
  certificateAlertEventEmitter: Pick<TCertificateAlertEventEmitter, "notify">;
};

export type TDigiCertRevocationSyncQueueFactory = ReturnType<typeof digicertRevocationSyncQueueFactory>;

export const digicertRevocationSyncQueueFactory = ({
  cronJob,
  certificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  projectDAL,
  appConnectionDAL,
  kmsService,
  auditLogService,
  pkiAlertV2Queue,
  certificateAlertEventEmitter
}: TDigiCertRevocationSyncQueueFactoryDep) => {
  const appCfg = getConfig();

  const markCertificateRevokedLocally = async (
    cert: {
      id: string;
      commonName: string;
      serialNumber: string;
      projectId: string;
      applicationId?: string | null;
      deletedAt?: Date | null;
    },
    revokedAt = new Date()
  ) => {
    await certificateDAL.updateById(cert.id, {
      status: CertStatus.REVOKED,
      revokedAt,
      revocationReason: revocationReasonToCrlCode(CrlReason.UNSPECIFIED)
    });

    if (!cert.deletedAt) {
      await certificateAlertEventEmitter.notify({
        certificateId: cert.id,
        projectId: cert.projectId,
        eventType: CertificateApplicationAlertEvent.Revocation,
        applicationId: cert.applicationId ?? null
      });
    }

    await auditLogService.createAuditLog({
      projectId: cert.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.REVOKE_CERT,
        metadata: {
          certId: cert.id,
          cn: cert.commonName,
          serialNumber: cert.serialNumber,
          revocationReason: CrlReason.UNSPECIFIED
        }
      }
    });

    if (cert.deletedAt) return;

    try {
      await pkiAlertV2Queue?.queueCertificateEvent({
        certificateId: cert.id,
        projectId: cert.projectId,
        eventType: PkiAlertEventType.REVOCATION,
        applicationId: cert.applicationId ?? null
      });
    } catch {
      logger.debug(`digicert-revocation-sync: failed to queue PKI revocation alert event [certId=${cert.id}]`);
    }
  };

  const loadCertificateAndIssuer = async (
    cert: { id: string; projectId: string; externalMetadata?: unknown },
    digicertClient: TDigiCertApiClient,
    getKmsDecryptor: (projectId: string) => Promise<(args: { cipherTextBlob: Buffer }) => Promise<Buffer>>
  ) => {
    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    let certificate: x509.X509Certificate;
    let chainPem: string;
    if (certBody?.encryptedCertificateChain) {
      const kmsDecryptor = await getKmsDecryptor(cert.projectId);
      certificate = new x509.X509Certificate(
        new Uint8Array(await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificate }))
      );
      chainPem = (await kmsDecryptor({ cipherTextBlob: certBody.encryptedCertificateChain })).toString();
    } else {
      const digicertCertificateId = DigiCertExternalMetadataSchema.safeParse(cert.externalMetadata).data?.certificateId;
      if (!digicertCertificateId) return null;
      const { leaf, chain } = extractLeafAndChain(await digicertClient.downloadCertificatePem(digicertCertificateId));
      certificate = new x509.X509Certificate(leaf);
      chainPem = chain;
    }

    const issuer = parsePemCertificateChain(chainPem)?.find((chainCert) => chainCert.subject === certificate.issuer);
    return issuer ? { certificate, issuer } : null;
  };

  const syncCertificateRevocationsFromOcsp = async (
    caId: string,
    digicertClient: TDigiCertApiClient,
    alreadyRevokedIds: Set<string>
  ) => {
    const activeCertificates = await certificateDAL.findActiveDigiCertCertsByCaId(caId);

    const kmsDecryptorsByProjectId = new Map<string, (args: { cipherTextBlob: Buffer }) => Promise<Buffer>>();
    const getKmsDecryptor = async (projectId: string) => {
      const cached = kmsDecryptorsByProjectId.get(projectId);
      if (cached) return cached;
      const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
      const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId });
      kmsDecryptorsByProjectId.set(projectId, kmsDecryptor);
      return kmsDecryptor;
    };

    const certificatesToCheck = activeCertificates.filter(({ id }) => !alreadyRevokedIds.has(id));
    const ocspLimit = pLimit(OCSP_CHECK_CONCURRENCY);
    const outcomes = await Promise.all(
      certificatesToCheck.map((cert) =>
        ocspLimit(async () => {
          try {
            const certificateAndIssuer = await loadCertificateAndIssuer(cert, digicertClient, getKmsDecryptor);
            if (!certificateAndIssuer) return "skipped" as const;

            const { status, revokedAt } = await getCertificateOcspStatus(certificateAndIssuer);
            if (status !== OcspCertStatus.Revoked) return "checked" as const;

            await markCertificateRevokedLocally(cert, revokedAt);
            logger.info(
              `digicert-revocation-sync: marked revoked from OCSP [caId=${caId}] [certId=${cert.id}] [serial=${cert.serialNumber}]`
            );
            return "revoked" as const;
          } catch (err) {
            logger.warn(err, `digicert-revocation-sync: OCSP check failed [caId=${caId}] [certId=${cert.id}]`);
            return "failed" as const;
          }
        })
      )
    );

    const countOf = (outcome: (typeof outcomes)[number]) => outcomes.filter((value) => value === outcome).length;
    logger.info(
      `digicert-revocation-sync: OCSP check done [caId=${caId}] [checked=${certificatesToCheck.length}] [revoked=${countOf("revoked")}] [failed=${countOf("failed")}] [skippedNoIssuer=${countOf("skipped")}]`
    );
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

    const reconciledCertificateIds = new Set<string>();
    for (let i = 0; i < upstreamRevokedOrderIds.length; i += ORDER_ID_LOOKUP_CHUNK_SIZE) {
      const orderIdChunk = upstreamRevokedOrderIds.slice(i, i + ORDER_ID_LOOKUP_CHUNK_SIZE);
      const certsToReconcile = await certificateDAL.findActiveDigiCertCertsByOrderIds(ca.id, orderIdChunk);

      for (const cert of certsToReconcile) {
        try {
          await markCertificateRevokedLocally(cert);
          reconciledCertificateIds.add(cert.id);
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
      `digicert-revocation-sync: CA done [caId=${ca.id}] [upstreamRevoked=${upstreamRevokedOrderIds.length}] [reconciled=${reconciledCertificateIds.size}]`
    );

    return { caId: ca.id, digicertClient, reconciledCertificateIds };
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
        const syncedCertificateAuthorities: Awaited<ReturnType<typeof syncRevocationsForCertificateAuthority>>[] = [];
        for (const caRow of digicertCertificateAuthorities) {
          try {
            syncedCertificateAuthorities.push(await syncRevocationsForCertificateAuthority(caRow));
            succeededCaCount += 1;
          } catch (err) {
            failedCaCount += 1;
            logger.error(err, `digicert-revocation-sync: CA failed [caId=${caRow.id}]`);
          }
        }

        for (const { caId, digicertClient, reconciledCertificateIds } of syncedCertificateAuthorities) {
          try {
            await syncCertificateRevocationsFromOcsp(caId, digicertClient, reconciledCertificateIds);
          } catch (err) {
            logger.error(err, `digicert-revocation-sync: OCSP check failed for CA [caId=${caId}]`);
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
