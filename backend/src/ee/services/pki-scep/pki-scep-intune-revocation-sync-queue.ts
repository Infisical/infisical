/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";

import { TKmsDataKeyService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
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
import {
  CertificateRevocationSource,
  CertStatus,
  CrlReason,
  PlatformRevocationOutcome
} from "@app/services/certificate/certificate-types";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";

import { ScepChallengeType } from "./challenge/scep-challenge-types";

const REVOCATION_SYNC_CRON_SCHEDULE = "*/15 * * * *";
const HANDLER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_ORG_TENANT = 10;

type TTenantConnection = { id: string; credentials: TMicrosoftIntuneConnectionCredentials };

type TOrgTenant = {
  tenantId: string;
  orgId: string;
  connections: TTenantConnection[];
  answersUnmatchedRequests: boolean;
};

type TMatchedCertificate = Awaited<
  ReturnType<TCertificateDALFactory["findScepCertsByValidationConnectionsAndSerials"]>
>[number];

type TScepIntuneRevocationSyncQueueFactoryDep = {
  cronJob: TCronJobFactory;
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "find">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "find">;
  kmsDataKeyService: Pick<TKmsDataKeyService, "createCipherPairWithDataKey" | "getProjectCertificateKmsKeyId">;
  kmsKeyService: Pick<TKmsKeyService, "decryptWithKmsKey">;
  certificateDAL: Pick<TCertificateDALFactory, "findScepCertsByValidationConnectionsAndSerials" | "primaryNode">;
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
  kmsDataKeyService,
  kmsKeyService,
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
        const kmsId = await kmsDataKeyService.getProjectCertificateKmsKeyId(projectId);
        decryptor = await kmsKeyService.decryptWithKmsKey({ kmsId });
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

  const revokeMatchedCertificate = async (certificateId: string) => {
    const revocation = await certificateService.revokeCertAsPlatform({
      certificateId,
      revocationReason: CrlReason.UNSPECIFIED
    });
    if (revocation.outcome !== PlatformRevocationOutcome.Revoked) return revocation;

    const { cert, ca, applicationName } = revocation;
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
            revocationReason: CrlReason.UNSPECIFIED,
            source: CertificateRevocationSource.MicrosoftIntune
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
    orgId,
    request,
    candidates,
    readIssuer,
    crlCaIds,
    answersUnmatchedRequests
  }: {
    tenantId: string;
    orgId: string;
    request: TIntuneRevocationRequest;
    candidates: TMatchedCertificate[];
    readIssuer: (certificate: TMatchedCertificate) => Promise<string | null>;
    crlCaIds: string[];
    answersUnmatchedRequests: boolean;
  }): Promise<TIntuneRevocationResult | null> => {
    const logContext = `[tenantId=${tenantId}] [orgId=${orgId}] [serial=${request.serialNumber}] [issuer=${request.issuerName ?? ""}]`;

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
            `scep-intune-revocation-sync: serial matches but the issuer differs ${logContext} [certificateIssuer=${issuer}]`
          );
        }
      }

      if (matches.length === 0) {
        if (!answersUnmatchedRequests) {
          logger.warn(
            `scep-intune-revocation-sync: no matching certificate, leaving the request queued because an Intune connection in this organization could not be read ${logContext}`
          );
          return null;
        }
        const unmatchedReason =
          candidates.length === 0
            ? "No certificate issued through an Intune SCEP enrollment in Infisical matches this serial number."
            : "The certificate with this serial number was issued by a different CA.";
        logger.info(`scep-intune-revocation-sync: ${unmatchedReason} ${logContext}`);
        return {
          requestContext: request.requestContext,
          succeeded: false,
          errorCode: IntuneRevocationErrorCode.NonRetryableServiceException,
          errorMessage: unmatchedReason
        };
      }

      let notRevocableReason: string | undefined;
      for (const certificate of matches) {
        if (certificate.caId) crlCaIds.push(certificate.caId);
        if (certificate.status !== CertStatus.REVOKED) {
          const revocation = await revokeMatchedCertificate(certificate.id);
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

  const syncOrgTenant = async ({ tenantId, orgId, connections, answersUnmatchedRequests }: TOrgTenant) => {
    const { serviceUri, intuneAccessToken } = await getTenantAccess(connections);
    const readIssuer = createIssuerReader();

    for (let batch = 0; batch < MAX_BATCHES_PER_ORG_TENANT; batch += 1) {
      const revocationRequests = await intuneDownloadRevocationRequests({
        intuneAccessToken,
        serviceUri,
        caConfiguration: orgId
      });
      if (revocationRequests.length === 0) return;

      const serialNumbers = [...new Set(revocationRequests.map((request) => request.serialNumber.toLowerCase()))];
      const certificates = await certificateDAL.findScepCertsByValidationConnectionsAndSerials(
        connections.map((connection) => connection.id),
        serialNumbers
      );

      const results: TIntuneRevocationResult[] = [];
      const crlCaIds: string[] = [];
      for (const request of revocationRequests) {
        const result = await handleRevocationRequest({
          tenantId,
          orgId,
          request,
          candidates: certificates.filter(
            (certificate) => certificate.serialNumber.toLowerCase() === request.serialNumber.toLowerCase()
          ),
          readIssuer,
          crlCaIds,
          answersUnmatchedRequests
        });
        if (result) results.push(result);
      }

      await certificateService.rebuildCrlsAfterPlatformRevocations(crlCaIds);

      if (results.length > 0) {
        await intuneUploadRevocationResults({ intuneAccessToken, serviceUri, results });
      }

      logger.info(
        `scep-intune-revocation-sync: batch done [tenantId=${tenantId}] [orgId=${orgId}] [requests=${revocationRequests.length}] [answered=${results.length}] [crlCas=${new Set(crlCaIds).size}]`
      );

      if (revocationRequests.length < INTUNE_MAX_REVOCATION_REQUESTS) return;
    }

    logger.warn(
      `scep-intune-revocation-sync: stopped at the batch limit, the remaining requests are processed on the next run [tenantId=${tenantId}] [orgId=${orgId}] [maxBatches=${MAX_BATCHES_PER_ORG_TENANT}]`
    );
  };

  const groupConnectionsByOrgTenant = async () => {
    const primary = certificateDAL.primaryNode();
    const intuneScepConfigs = await scepEnrollmentConfigDAL.find(
      { challengeType: ScepChallengeType.MICROSOFT_INTUNE },
      { tx: primary }
    );
    const connectionIds = [
      ...new Set(
        intuneScepConfigs
          .map((config) => config.validationConnectionId)
          .filter((connectionId): connectionId is string => !!connectionId)
      )
    ];
    if (connectionIds.length === 0) return [];

    const connections = await appConnectionDAL.find(
      {
        $in: { id: connectionIds },
        app: AppConnection.MicrosoftIntune
      },
      { tx: primary }
    );

    const orgTenants = new Map<string, TOrgTenant>();
    const orgIdsWithUnreadableConnections = new Set<string>();
    for (const connection of connections) {
      try {
        const credentials = (await decryptAppConnectionCredentials({
          orgId: connection.orgId,
          projectId: connection.projectId,
          encryptedCredentials: connection.encryptedCredentials,
          kmsDataKeyService
        })) as TMicrosoftIntuneConnectionCredentials;

        const tenantId = credentials.tenantId.toLowerCase();
        const key = `${tenantId}:${connection.orgId}`;
        const orgTenant = orgTenants.get(key) ?? {
          tenantId,
          orgId: connection.orgId,
          connections: [],
          answersUnmatchedRequests: true
        };
        orgTenant.connections.push({ id: connection.id, credentials });
        orgTenants.set(key, orgTenant);
      } catch (err) {
        orgIdsWithUnreadableConnections.add(connection.orgId);
        logger.error(
          `scep-intune-revocation-sync: failed to read connection credentials [connectionId=${connection.id}] [error=${errorMessageOf(err)}]`
        );
      }
    }

    return [...orgTenants.values()].map((orgTenant) => ({
      ...orgTenant,
      answersUnmatchedRequests: !orgIdsWithUnreadableConnections.has(orgTenant.orgId)
    }));
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
        const orgTenants = await groupConnectionsByOrgTenant();
        for (const orgTenant of orgTenants) {
          try {
            await syncOrgTenant(orgTenant);
          } catch (err) {
            logger.error(
              `scep-intune-revocation-sync: tenant failed [tenantId=${orgTenant.tenantId}] [orgId=${orgTenant.orgId}] [error=${errorMessageOf(err)}]`
            );
          }
        }
      }
    });
  };

  return { init };
};
