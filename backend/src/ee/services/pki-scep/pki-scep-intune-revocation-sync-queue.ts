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
  IntuneRevocationErrorCode,
  intuneDownloadRevocationRequests,
  intuneUploadRevocationResults,
  MicrosoftEntraTokenResource,
  TIntuneRevocationRequest,
  TIntuneRevocationResult,
  TMicrosoftIntuneConnectionCredentials
} from "@app/services/app-connection/microsoft-intune";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";
import { CertStatus, CrlReason, PlatformRevocationOutcome } from "@app/services/certificate/certificate-types";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { ScepChallengeType } from "./challenge/scep-challenge-types";

const REVOCATION_SYNC_CRON_SCHEDULE = "*/15 * * * *";
const HANDLER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_TENANT = 10;

type TTenantConnection = { id: string; credentials: TMicrosoftIntuneConnectionCredentials };

type TMatchedCertificate = Awaited<
  ReturnType<TCertificateDALFactory["findScepCertsByValidationConnectionsAndSerials"]>
>[number];

type TScepIntuneRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "find">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithKmsKey" | "generateKmsKey">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  certificateDAL: Pick<TCertificateDALFactory, "findScepCertsByValidationConnectionsAndSerials">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateService: Pick<TCertificateServiceFactory, "revokeCertAsPlatform" | "rebuildCrlsAfterPlatformRevocations">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TScepIntuneRevocationSyncQueueFactory = ReturnType<typeof scepIntuneRevocationSyncQueueFactory>;

const errorMessageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const DISTINGUISHED_NAME_TYPE_ALIASES: Record<string, string> = { S: "ST", EMAILADDRESS: "E" };
const DISTINGUISHED_NAME_EXTRA_TYPES = {
  S: "2.5.4.8",
  EMAILADDRESS: "1.2.840.113549.1.9.1",
  emailAddress: "1.2.840.113549.1.9.1",
  SERIALNUMBER: "2.5.4.5"
};

const normalizeDistinguishedName = (distinguishedName: string) => {
  try {
    return new x509.Name(distinguishedName, DISTINGUISHED_NAME_EXTRA_TYPES)
      .toJSON()
      .flatMap((relativeName) =>
        Object.entries(relativeName).flatMap(([type, values]) => {
          const normalizedType = DISTINGUISHED_NAME_TYPE_ALIASES[type.toUpperCase()] ?? type.toUpperCase();
          return values.map((value) => `${normalizedType}=${value.trim().toLowerCase()}`);
        })
      )
      .sort()
      .join(",");
  } catch {
    return distinguishedName.trim().toLowerCase();
  }
};

export const scepIntuneRevocationSyncQueueFactory = ({
  cronJob,
  scepEnrollmentConfigDAL,
  appConnectionDAL,
  kmsService,
  projectDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateAuthorityCertDAL,
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

    const getDecryptor = async (projectId: string) => {
      let decryptor = decryptorsByProjectId.get(projectId);
      if (!decryptor) {
        const kmsId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
        decryptor = await kmsService.decryptWithKmsKey({ kmsId });
        decryptorsByProjectId.set(projectId, decryptor);
      }
      return decryptor;
    };

    return async (certificate: TMatchedCertificate) => {
      const certificateBody = await certificateBodyDAL.findOne({ certId: certificate.id });
      if (certificateBody) {
        const decryptor = await getDecryptor(certificate.projectId);
        const certificateDer = await decryptor({ cipherTextBlob: certificateBody.encryptedCertificate });
        return new x509.X509Certificate(new Uint8Array(certificateDer)).issuer;
      }

      const caCertificate = certificate.caCertId
        ? await certificateAuthorityCertDAL.findById(certificate.caCertId)
        : undefined;
      if (caCertificate) {
        const decryptor = await getDecryptor(certificate.projectId);
        const caCertificateDer = await decryptor({ cipherTextBlob: caCertificate.encryptedCertificate });
        return new x509.X509Certificate(new Uint8Array(caCertificateDer)).subject;
      }

      return null;
    };
  };

  const revokeMatchedCertificate = async (certificateId: string, revokedCaIds: string[]) => {
    const revocation = await certificateService.revokeCertAsPlatform({
      certificateId,
      revocationReason: CrlReason.UNSPECIFIED
    });
    if (revocation.outcome !== PlatformRevocationOutcome.Revoked) return revocation;

    const { cert, ca, applicationName } = revocation;
    revokedCaIds.push(ca.id);
    try {
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
    } catch (err) {
      logger.error(
        `scep-intune-revocation-sync: failed to write the audit log for a revoked certificate [certId=${cert.id}] [serial=${cert.serialNumber}] [error=${errorMessageOf(err)}]`
      );
    }
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
        const issuer = request.issuerName ? await readIssuer(candidate) : null;
        if (
          issuer === null ||
          normalizeDistinguishedName(issuer) === normalizeDistinguishedName(request.issuerName ?? "")
        ) {
          matches.push(candidate);
        } else {
          logger.warn(
            `scep-intune-revocation-sync: serial matches but the issuer differs, leaving the request for its issuer ${logContext} [certificateIssuer=${issuer}]`
          );
        }
      }

      if (matches.length === 0) {
        if (candidates.length === 0) {
          logger.info(
            `scep-intune-revocation-sync: no matching certificate, leaving the request for its issuer ${logContext}`
          );
        }
        return null;
      }

      let notRevocableReason: string | undefined;
      for (const certificate of matches) {
        if (certificate.status !== CertStatus.REVOKED) {
          const revocation = await revokeMatchedCertificate(certificate.id, revokedCaIds);
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
    const readIssuer = createIssuerReader();

    for (let batch = 0; batch < MAX_BATCHES_PER_TENANT; batch += 1) {
      const revocationRequests = await intuneDownloadRevocationRequests({ intuneAccessToken, serviceUri });
      if (revocationRequests.length === 0) return;

      const serialNumbers = [...new Set(revocationRequests.map((request) => request.serialNumber.toLowerCase()))];
      const certificates = await certificateDAL.findScepCertsByValidationConnectionsAndSerials(
        connections.map((connection) => connection.id),
        serialNumbers
      );

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

      if (revocationRequests.length < INTUNE_MAX_REVOCATION_REQUESTS) return;
    }

    logger.warn(
      `scep-intune-revocation-sync: stopped at the batch limit, the remaining requests are processed on the next run [tenantId=${tenantId}] [maxBatches=${MAX_BATCHES_PER_TENANT}]`
    );
  };

  const groupConnectionsByTenant = async () => {
    const intuneScepConfigs = await scepEnrollmentConfigDAL.find({ challengeType: ScepChallengeType.MICROSOFT_INTUNE });
    const connectionIds = [
      ...new Set(
        intuneScepConfigs
          .map((config) => config.validationConnectionId)
          .filter((connectionId): connectionId is string => !!connectionId)
      )
    ];
    if (connectionIds.length === 0) return new Map<string, TTenantConnection[]>();

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
