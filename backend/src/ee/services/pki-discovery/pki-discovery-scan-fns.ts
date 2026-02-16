/* eslint-disable no-await-in-loop */
import net from "net";
import pLimit from "p-limit";

import { TCertificatesInsert, TPkiCertificateInstallationsInsert } from "@app/db/schemas";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TPkiCertificateInstallationCertDALFactory } from "./pki-certificate-installation-cert-dal";
import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { computeLocationFingerprint, resolveDomain, resolveTargets, scanEndpoint } from "./pki-discovery-fns";
import { TPkiDiscoveryInstallationDALFactory } from "./pki-discovery-installation-dal";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import {
  CertificateSource,
  PkiDiscoveryScanStatus,
  PkiInstallationLocationType,
  PkiInstallationType,
  ScanEndpointFailureReason,
  TPkiDiscoveryTargetConfig,
  TScanCertificateResult,
  TScanEndpointResult
} from "./pki-discovery-types";

const SCAN_CONCURRENCY = 20;
const DEFAULT_SCAN_TIMEOUT = 10000;
const GATEWAY_CONSECUTIVE_FAILURE_LIMIT = 10;

const DB_VARCHAR_LIMIT = 4096;
const DB_SHORT_VARCHAR_LIMIT = 255;

const truncateString = (value: string | null | undefined, maxLength: number): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value.length <= maxLength) {
    return value;
  }
  const truncationSuffix = "... (truncated)";
  return value.substring(0, maxLength - truncationSuffix.length) + truncationSuffix;
};

type TExecuteScanDeps = {
  pkiDiscoveryConfigDAL: TPkiDiscoveryConfigDALFactory;
  pkiDiscoveryScanHistoryDAL: TPkiDiscoveryScanHistoryDALFactory;
  pkiCertificateInstallationDAL: TPkiCertificateInstallationDALFactory;
  pkiDiscoveryInstallationDAL: TPkiDiscoveryInstallationDALFactory;
  pkiCertificateInstallationCertDAL: TPkiCertificateInstallationCertDALFactory;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: TCertificateBodyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL?: Pick<TGatewayV2DALFactory, "findById">;
};

export const executeScan = async (discoveryId: string, deps: TExecuteScanDeps): Promise<void> => {
  const { pkiDiscoveryConfigDAL, pkiDiscoveryScanHistoryDAL, projectDAL, kmsService, gatewayV2Service } = deps;

  const startedAt = new Date();
  let scanHistoryId: string | undefined;

  try {
    const discoveryConfig = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discoveryConfig) {
      logger.error({ discoveryId }, "Discovery config not found");
      throw new Error(`Discovery config not found: ${discoveryId}`);
    }

    logger.info(
      { discoveryId, name: discoveryConfig.name, projectId: discoveryConfig.projectId },
      "PKI discovery scan starting"
    );

    const certificateKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: discoveryConfig.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateKmsKeyId
    });

    const scanHistory = await pkiDiscoveryConfigDAL.transaction(async (tx) => {
      const history = await pkiDiscoveryScanHistoryDAL.create(
        {
          discoveryConfigId: discoveryId,
          startedAt,
          status: PkiDiscoveryScanStatus.Running,
          targetsScannedCount: 0,
          certificatesFoundCount: 0,
          installationsFoundCount: 0
        },
        tx
      );

      await pkiDiscoveryConfigDAL.updateById(
        discoveryId,
        {
          lastScanStatus: PkiDiscoveryScanStatus.Running,
          lastScanJobId: history.id
        },
        tx
      );

      return history;
    });
    scanHistoryId = scanHistory.id;

    let gatewayName: string | undefined;
    if (discoveryConfig.gatewayId && deps.gatewayV2DAL) {
      const gw = await deps.gatewayV2DAL.findById(discoveryConfig.gatewayId);
      gatewayName = gw?.name;
    }

    const targetConfig = discoveryConfig.targetConfig as TPkiDiscoveryTargetConfig;
    const hasGateway = !!discoveryConfig.gatewayId;
    const targets = await resolveTargets(targetConfig, hasGateway);

    const uniqueHosts = new Set(targets.map((t) => t.host)).size;
    const uniquePorts = new Set(targets.map((t) => t.port)).size;

    logger.info(
      {
        discoveryId,
        totalTargets: targets.length,
        uniqueHosts,
        uniquePorts,
        ipRanges: targetConfig.ipRanges?.length || 0,
        domains: targetConfig.domains?.length || 0,
        ports: targetConfig.ports
      },
      "Targets resolved, starting TLS scans"
    );

    const limit = pLimit(SCAN_CONCURRENCY);
    let results: TScanEndpointResult[];

    if (discoveryConfig.gatewayId && gatewayV2Service) {
      logger.info({ discoveryId, gatewayId: discoveryConfig.gatewayId }, "Scanning via gateway proxy");

      results = [];
      let consecutiveGwFailures = 0;
      let gatewayCircuitBroken = false;

      // Gateway scans must be sequential - each target needs its own proxy connection
      for (const target of targets) {
        let targetSuccess = false;

        try {
          const targetGatewayDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
            gatewayId: discoveryConfig.gatewayId,
            targetHost: target.host,
            targetPort: target.port
          });

          if (!targetGatewayDetails) {
            consecutiveGwFailures += 1;
            results.push({
              host: target.host,
              port: target.port,
              success: false,
              failureReason: ScanEndpointFailureReason.ConnectionFailed,
              error: "Gateway failed to establish proxy connection to target",
              sniHostname: target.sniHostname
            });
          } else {
            const scanResult = await withGatewayV2Proxy(
              async (proxyPort) => {
                const sniHostname = target.sniHostname || target.host;
                return scanEndpoint("localhost", proxyPort, DEFAULT_SCAN_TIMEOUT, sniHostname);
              },
              {
                relayHost: targetGatewayDetails.relayHost,
                gateway: targetGatewayDetails.gateway,
                relay: targetGatewayDetails.relay,
                protocol: GatewayProxyProtocol.Tcp
              }
            );

            results.push({
              ...scanResult,
              host: target.host,
              port: target.port,
              sniHostname: target.sniHostname
            });

            if (scanResult.failureReason !== ScanEndpointFailureReason.ConnectionFailed) {
              targetSuccess = true;
            }
          }
        } catch (error) {
          consecutiveGwFailures += 1;
          const gatewayError = error instanceof Error ? error.message : "Unknown gateway error";
          results.push({
            host: target.host,
            port: target.port,
            success: false,
            failureReason: ScanEndpointFailureReason.ConnectionFailed,
            error: `Gateway proxy error: ${gatewayError}`,
            sniHostname: target.sniHostname
          });
        }

        if (targetSuccess) {
          consecutiveGwFailures = 0;
        }

        if (consecutiveGwFailures >= GATEWAY_CONSECUTIVE_FAILURE_LIMIT) {
          logger.warn(
            { discoveryId, consecutiveGwFailures, scannedSoFar: results.length, totalTargets: targets.length },
            "Gateway circuit breaker triggered — too many consecutive proxy failures, aborting scan"
          );
          gatewayCircuitBroken = true;
          break;
        }
      }

      if (gatewayCircuitBroken) {
        const completedAt = new Date();
        const lastFailedResult = results[results.length - 1];
        const lastError = lastFailedResult?.error ? ` Last error: ${lastFailedResult.error}` : "";
        const cbErrorMessage = `Gateway connection failed to reach target network. Check that the gateway is online and can reach the target network.${lastError}`;

        await pkiDiscoveryConfigDAL.transaction(async (tx) => {
          if (scanHistoryId) {
            await pkiDiscoveryScanHistoryDAL.updateById(
              scanHistoryId,
              {
                status: PkiDiscoveryScanStatus.Failed,
                completedAt,
                targetsScannedCount: results.length,
                certificatesFoundCount: 0,
                installationsFoundCount: 0,
                errorMessage: cbErrorMessage
              },
              tx
            );
          }

          await pkiDiscoveryConfigDAL.updateById(
            discoveryId,
            {
              lastScanStatus: PkiDiscoveryScanStatus.Failed,
              lastScannedAt: completedAt,
              lastScanMessage: truncateString(cbErrorMessage, DB_SHORT_VARCHAR_LIMIT)
            },
            tx
          );
        });

        return;
      }
    } else {
      const scanPromises = targets.map((target) =>
        limit(async (): Promise<TScanEndpointResult> => {
          const result = await scanEndpoint(target.host, target.port, DEFAULT_SCAN_TIMEOUT, target.sniHostname);

          return {
            ...result,
            sniHostname: target.sniHostname
          };
        })
      );
      results = await Promise.all(scanPromises);
    }

    logger.info({ discoveryId, scannedCount: results.length }, "TLS scans completed, processing results");

    const configStillExists = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!configStillExists) {
      logger.warn({ discoveryId }, "Discovery config was deleted during scan, aborting result processing");
      if (scanHistoryId) {
        await pkiDiscoveryScanHistoryDAL.deleteById(scanHistoryId);
      }
      return;
    }

    const uniqueCertificateIds = new Set<string>();
    const uniqueInstallationIds = new Set<string>();
    let successfulScans = 0;
    let certParseErrors = 0;
    const scanErrors: string[] = [];
    const now = new Date();

    const domainCertMap = new Map<string, Set<string>>();

    for (const result of results) {
      if (result.success && result.certificates && result.certificates.length > 0) {
        successfulScans += 1;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const processedCertIds = await processEndpointResult(
          result,
          discoveryConfig.projectId,
          discoveryId,
          now,
          deps,
          kmsEncryptor,
          discoveryConfig.gatewayId ?? undefined,
          gatewayName
        );

        if (processedCertIds.installationId) {
          uniqueInstallationIds.add(processedCertIds.installationId);
        }
        for (const certId of processedCertIds.certificateIds) {
          uniqueCertificateIds.add(certId);
        }

        if (processedCertIds.sniHostname && processedCertIds.certificateIds.length > 0) {
          const domainKey = `${processedCertIds.sniHostname}:${result.port}`;
          if (!domainCertMap.has(domainKey)) {
            domainCertMap.set(domainKey, new Set());
          }
          const certSet = domainCertMap.get(domainKey)!;
          for (const certId of processedCertIds.certificateIds) {
            certSet.add(certId);
          }
        }
      } else if (!result.success && result.failureReason === ScanEndpointFailureReason.CertificateParseError) {
        certParseErrors += 1;
        scanErrors.push(`${result.host}:${result.port}: ${result.error}`);
        logger.warn(
          { host: result.host, port: result.port, error: result.error },
          "Failed to parse certificate from TLS endpoint"
        );
      }
    }

    if (domainCertMap.size > 0) {
      for (const [domainKey, certIds] of domainCertMap) {
        const [domain, portStr] = domainKey.split(":");
        const port = parseInt(portStr, 10);

        const domainLocationDetails = {
          fqdn: domain,
          port,
          protocol: "tls",
          ...(gatewayName && { gatewayName })
        };

        const domainFingerprint = computeLocationFingerprint(
          PkiInstallationLocationType.Network,
          domainLocationDetails,
          discoveryConfig.gatewayId ?? undefined
        );

        const domainInstallationId = await deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
          let domainInstallation = await deps.pkiCertificateInstallationDAL.findByFingerprint(
            discoveryConfig.projectId,
            domainFingerprint,
            tx
          );

          if (!domainInstallation) {
            domainInstallation = await deps.pkiCertificateInstallationDAL.create(
              {
                projectId: discoveryConfig.projectId,
                locationType: PkiInstallationLocationType.Network,
                locationDetails: domainLocationDetails,
                locationFingerprint: domainFingerprint,
                name: domain,
                type: PkiInstallationType.Unknown,
                lastSeenAt: now
              },
              tx
            );
          } else {
            await deps.pkiCertificateInstallationDAL.updateById(domainInstallation.id, { lastSeenAt: now }, tx);
          }

          const domainLink = await deps.pkiDiscoveryInstallationDAL.upsertLink(
            discoveryId,
            domainInstallation.id,
            now,
            tx
          );
          if (!domainLink) return null;

          for (const certId of certIds) {
            await deps.pkiCertificateInstallationCertDAL.upsertCertLink(
              domainInstallation.id,
              certId,
              { lastSeenAt: now },
              tx
            );
          }

          return domainInstallation.id;
        });

        if (!domainInstallationId) continue; // eslint-disable-line no-continue

        uniqueInstallationIds.add(domainInstallationId);
      }
    }

    logger.info(
      {
        discoveryId,
        successfulScans,
        certParseErrors,
        totalTargets: targets.length,
        certificatesFoundCount: uniqueCertificateIds.size,
        installationsFoundCount: uniqueInstallationIds.size
      },
      "Finished processing scan results"
    );

    const completedAt = new Date();
    const finalStatus = PkiDiscoveryScanStatus.Completed;
    let errorMessage: string | null = null;

    if (certParseErrors > 0) {
      errorMessage = `${certParseErrors} certificate(s) could not be parsed: ${scanErrors.join("; ")}`;
    }

    await pkiDiscoveryConfigDAL.transaction(async (tx) => {
      if (scanHistoryId) {
        await pkiDiscoveryScanHistoryDAL.updateById(
          scanHistoryId,
          {
            status: finalStatus,
            completedAt,
            targetsScannedCount: targets.length,
            certificatesFoundCount: uniqueCertificateIds.size,
            installationsFoundCount: uniqueInstallationIds.size,
            errorMessage
          },
          tx
        );
      }

      await pkiDiscoveryConfigDAL.updateById(
        discoveryId,
        {
          lastScanStatus: finalStatus,
          lastScannedAt: completedAt,
          lastScanMessage: truncateString(errorMessage, DB_SHORT_VARCHAR_LIMIT)
        },
        tx
      );
    });

    const durationMs = completedAt.getTime() - startedAt.getTime();
    const durationSec = (durationMs / 1000).toFixed(1);

    logger.info(
      {
        discoveryId,
        name: discoveryConfig.name,
        status: finalStatus,
        durationSec,
        targetsScanned: targets.length,
        successfulScans,
        certParseErrors,
        certificatesFound: uniqueCertificateIds.size,
        installationsFound: uniqueInstallationIds.size
      },
      `PKI discovery scan completed in ${durationSec}s - found ${uniqueCertificateIds.size} certificate(s) at ${uniqueInstallationIds.size} installation(s)`
    );
  } catch (error) {
    const durationMs = new Date().getTime() - startedAt.getTime();
    const durationSec = (durationMs / 1000).toFixed(1);

    logger.error(
      {
        discoveryId,
        durationSec,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      `PKI discovery scan failed after ${durationSec}s`
    );

    const rawErrorMessage = error instanceof Error ? error.message : "Unknown error";
    const truncatedCatchErrorMessage = truncateString(rawErrorMessage, DB_SHORT_VARCHAR_LIMIT);

    await pkiDiscoveryConfigDAL.transaction(async (tx) => {
      if (scanHistoryId) {
        await pkiDiscoveryScanHistoryDAL.updateById(
          scanHistoryId,
          {
            status: PkiDiscoveryScanStatus.Failed,
            completedAt: new Date(),
            errorMessage: truncatedCatchErrorMessage
          },
          tx
        );
      }

      await pkiDiscoveryConfigDAL.updateById(
        discoveryId,
        {
          lastScanStatus: PkiDiscoveryScanStatus.Failed,
          lastScanMessage: truncatedCatchErrorMessage
        },
        tx
      );
    });

    throw error;
  }
};

type TKmsEncryptor = (data: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer }>;

const processEndpointResult = async (
  result: TScanEndpointResult,
  projectId: string,
  discoveryId: string,
  scanTime: Date,
  deps: TExecuteScanDeps,
  kmsEncryptor: TKmsEncryptor,
  gatewayId?: string,
  gatewayName?: string
): Promise<{ installationId?: string; certificateIds: string[]; sniHostname?: string }> => {
  const {
    pkiCertificateInstallationDAL,
    pkiDiscoveryInstallationDAL,
    pkiCertificateInstallationCertDAL,
    certificateDAL,
    certificateBodyDAL
  } = deps;

  const certificateIds: string[] = [];

  let ipAddress: string | null = null;
  const isIp = net.isIP(result.host) !== 0;

  if (isIp) {
    ipAddress = result.host;
  } else {
    try {
      const resolved = await resolveDomain(result.host);
      if (resolved.length > 0) {
        [ipAddress] = resolved;
      }
    } catch {
      // do nothing
    }
  }

  const locationDetails = {
    ipAddress: ipAddress || result.host,
    port: result.port,
    protocol: "tls",
    ...(gatewayName && { gatewayName })
  };

  const locationFingerprint = computeLocationFingerprint(
    PkiInstallationLocationType.Network,
    locationDetails,
    gatewayId
  );

  const displayName = ipAddress || result.host;

  if (result.certificates) {
    for (const certResult of result.certificates) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const certId = await processDiscoveredCertificate(
        certResult,
        projectId,
        { certificateDAL, certificateBodyDAL, kmsEncryptor },
        {
          discoveredBy: discoveryId,
          host: result.host,
          port: result.port,
          sniHostname: result.sniHostname,
          discoveredAt: scanTime.toISOString(),
          issuerCommonName: certResult.issuerCommonName,
          issuerOrganization: certResult.issuerOrganization
        }
      );
      if (certId) {
        certificateIds.push(certId);
      }
    }
  }

  const installationId = await deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    let installation = await pkiCertificateInstallationDAL.findByFingerprint(projectId, locationFingerprint, tx);

    if (!installation) {
      const installationData: TPkiCertificateInstallationsInsert = {
        projectId,
        locationType: PkiInstallationLocationType.Network,
        locationDetails,
        locationFingerprint,
        name: displayName,
        type: PkiInstallationType.Unknown,
        lastSeenAt: scanTime
      };

      installation = await pkiCertificateInstallationDAL.create(installationData, tx);
    } else {
      await pkiCertificateInstallationDAL.updateById(installation.id, { lastSeenAt: scanTime }, tx);
    }

    const link = await pkiDiscoveryInstallationDAL.upsertLink(discoveryId, installation.id, scanTime, tx);
    if (!link) {
      return null;
    }

    for (const certId of certificateIds) {
      await pkiCertificateInstallationCertDAL.upsertCertLink(installation.id, certId, { lastSeenAt: scanTime }, tx);
    }

    return installation.id;
  });

  if (!installationId) {
    return { certificateIds: [] };
  }

  return { installationId, certificateIds, sniHostname: result.sniHostname };
};

type TProcessDiscoveredCertDeps = {
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: TCertificateBodyDALFactory;
  kmsEncryptor: (data: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer }>;
};

const processDiscoveredCertificate = async (
  certResult: TScanCertificateResult,
  projectId: string,
  deps: TProcessDiscoveredCertDeps,
  discoveryMetadata?: Record<string, unknown>
): Promise<string | null> => {
  const { certificateDAL, certificateBodyDAL, kmsEncryptor } = deps;

  try {
    const existingCerts = await certificateDAL.find({
      projectId,
      fingerprintSha256: certResult.fingerprint
    });

    if (existingCerts.length > 0) {
      return existingCerts[0].id;
    }

    const friendlyName =
      truncateString(certResult.commonName, DB_SHORT_VARCHAR_LIMIT) ||
      `Discovered: ${certResult.fingerprint.substring(0, 16)}`;

    const serialNumber = certResult.serialNumber || certResult.fingerprint.substring(0, 40);

    const certData: TCertificatesInsert = {
      projectId,
      status: CertStatus.ACTIVE,
      serialNumber: truncateString(serialNumber, DB_SHORT_VARCHAR_LIMIT) || "unknown",
      friendlyName,
      commonName: truncateString(certResult.commonName, DB_SHORT_VARCHAR_LIMIT) || "Unknown",
      altNames: truncateString(certResult.altNames, DB_VARCHAR_LIMIT),
      notBefore: certResult.notBefore,
      notAfter: certResult.notAfter,
      fingerprintSha256: certResult.fingerprint,
      fingerprintSha1: certResult.fingerprintSha1,
      subjectOrganization: truncateString(certResult.subjectOrganization, DB_SHORT_VARCHAR_LIMIT),
      subjectOrganizationalUnit: truncateString(certResult.subjectOrganizationalUnit, DB_SHORT_VARCHAR_LIMIT),
      subjectCountry: truncateString(certResult.subjectCountry, DB_SHORT_VARCHAR_LIMIT),
      subjectState: truncateString(certResult.subjectState, DB_SHORT_VARCHAR_LIMIT),
      subjectLocality: truncateString(certResult.subjectLocality, DB_SHORT_VARCHAR_LIMIT),
      keyAlgorithm: truncateString(certResult.keyAlgorithm, DB_SHORT_VARCHAR_LIMIT),
      signatureAlgorithm: truncateString(certResult.signatureAlgorithm, DB_SHORT_VARCHAR_LIMIT),
      keyUsages: certResult.keyUsages,
      extendedKeyUsages: certResult.extendedKeyUsages,
      isCA: certResult.isCA,
      pathLength: certResult.pathLength,
      source: CertificateSource.Discovered,
      discoveryMetadata: discoveryMetadata || null
    };

    let encryptedCertificate: Buffer | undefined;
    let encryptedCertificateChain: Buffer | undefined;

    if (certResult.pemChain && certResult.pemChain.length > 0) {
      const certificatePem = certResult.pemChain[0];
      const chainPem = certResult.pemChain.slice(1).join("\n");

      ({ cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
        plainText: Buffer.from(certificatePem)
      }));

      if (chainPem) {
        ({ cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
          plainText: Buffer.from(chainPem)
        }));
      }
    }

    const newCert = await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(certData, tx);

      if (encryptedCertificate) {
        await certificateBodyDAL.create(
          {
            certId: cert.id,
            encryptedCertificate,
            encryptedCertificateChain
          },
          tx
        );
      }

      return cert;
    });

    return newCert.id;
  } catch (error) {
    const dbError = error as { code?: string };
    // PG unique constraint violation — another concurrent scan already inserted this certificate
    if (dbError.code === "23505") {
      const existingCerts = await certificateDAL.find({
        projectId,
        fingerprintSha256: certResult.fingerprint
      });
      if (existingCerts.length > 0) {
        logger.debug({ fingerprint: certResult.fingerprint }, "Certificate already exists (concurrent insert)");
        return existingCerts[0].id;
      }
    }
    logger.error({ error, fingerprint: certResult.fingerprint, projectId }, "Failed to process discovered certificate");
    return null;
  }
};
