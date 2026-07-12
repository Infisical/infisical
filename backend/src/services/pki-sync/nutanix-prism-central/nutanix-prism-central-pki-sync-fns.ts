/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import { AxiosError } from "axios";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { NutanixPrismCentralConnectionMethod } from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-enums";
import {
  executeNutanixOperationWithGateway,
  NUTANIX_DEFAULT_PORT
} from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-fns";
import { TNutanixPrismCentralConnection } from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { TNutanixPrismCentralPkiSyncConfig } from "./nutanix-prism-central-pki-sync-types";

type TNutanixCredentials = TNutanixPrismCentralConnection["credentials"];

type TNutanixPrismCentralPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findByPkiSyncAndCertificate" | "updateById" | "addCertificates" | "updateSyncStatus" | "removeCertificates"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

const getNutanixCredentials = (pkiSync: TPkiSyncWithCredentials): TNutanixCredentials => {
  const credentials = pkiSync.connection.credentials as TNutanixCredentials;
  if (!credentials?.hostname) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: "Nutanix Prism Central credentials (hostname) not found in connection credentials"
    });
  }
  return credentials;
};

const NUTANIX_SUPPORTED_ALGORITHMS = ["RSA_2048", "RSA_4096", "ECDSA_256", "ECDSA_521"] as const;
type NutanixKeyAlgorithm = (typeof NUTANIX_SUPPORTED_ALGORITHMS)[number];

const inferPrivateKeyAlgorithm = (certPem: string): NutanixKeyAlgorithm => {
  let detected: string | undefined;

  try {
    const cert = new x509.X509Certificate(certPem);
    const alg = cert.publicKey.algorithm;

    if (alg.name === "RSASSA-PKCS1-v1_5" || alg.name === "RSA-PSS" || alg.name === "RSAES-PKCS1-v1_5") {
      const rsaAlg = alg as { modulusLength?: number };
      const bits = rsaAlg.modulusLength;
      if (bits === 2048) detected = "RSA_2048";
      else if (bits === 4096) detected = "RSA_4096";
      else detected = `RSA_${bits ?? "unknown"}`;
    } else if (alg.name === "ECDSA" || alg.name === "EC") {
      const ecAlg = alg as { namedCurve?: string };
      const curve = ecAlg.namedCurve ?? "";
      if (curve.includes("256") || curve.includes("P-256")) detected = "ECDSA_256";
      else if (curve.includes("521") || curve.includes("P-521")) detected = "ECDSA_521";
      else detected = `ECDSA_${curve || "unknown"}`;
    } else {
      detected = alg.name;
    }
  } catch (err) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Failed to parse certificate to determine key algorithm: ${err instanceof Error ? err.message : String(err)}`
    });
  }

  if (!detected || !(NUTANIX_SUPPORTED_ALGORITHMS as readonly string[]).includes(detected)) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Certificate uses key algorithm "${detected}" which is not supported by Nutanix Prism Central. Supported algorithms: ${NUTANIX_SUPPORTED_ALGORITHMS.join(", ")}`
    });
  }

  return detected as NutanixKeyAlgorithm;
};

const pemToNutanixFormat = (pem: string): string => Buffer.from(pem.trim()).toString("base64");

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export const nutanixPrismCentralPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service,
  gatewayPoolService
}: TNutanixPrismCentralPkiSyncFactoryDeps) => {
  const resolveGateway = async (pkiSync: TPkiSyncWithCredentials) => {
    return gatewayPoolService
      ? gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: pkiSync.connection.gatewayId,
          gatewayPoolId: pkiSync.connection.gatewayPoolId
        })
      : (pkiSync.connection.gatewayId ?? null);
  };

  const syncCertificates = async (pkiSync: TPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    const credentials = getNutanixCredentials(pkiSync);
    const destinationConfig = pkiSync.destinationConfig as TNutanixPrismCentralPkiSyncConfig;
    const { clusterId } = destinationConfig;

    if (!clusterId) {
      throw new PkiSyncError({ shouldRetry: false, message: "Nutanix cluster ID is required in destination config" });
    }

    const certEntries = Object.entries(certificateMap);
    if (certEntries.length === 0) {
      return { uploaded: 0, skipped: 0 };
    }

    const sortedEntries = [...certEntries].sort(([, a], [, b]) => {
      try {
        const certA = new x509.X509Certificate(a.cert);
        const certB = new x509.X509Certificate(b.cert);
        return certB.notAfter.getTime() - certA.notAfter.getTime();
      } catch {
        return 0;
      }
    });

    const [certName, { cert, privateKey, certificateChain, certificateId }] = sortedEntries[0];
    const skipped = certEntries.length - 1;

    // Nutanix has a single certificate slot per cluster, so only the newest
    // certificate is uploaded. Report the rest as skipped so their sync records
    // are not marked as succeeded by the queue.
    const skippedCertificates = sortedEntries.slice(1).map(([name]) => ({
      name,
      reason: "Only the newest certificate is synced to the Nutanix Prism Central cluster certificate slot"
    }));

    if (sortedEntries.length > 1) {
      logger.info(
        { syncId: pkiSync.id, chosen: certName, totalCerts: certEntries.length },
        `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: multiple certificates found, selected newest [certName=${certName}]`
      );
    }

    if (!cert || !cert.includes("-----BEGIN CERTIFICATE-----")) {
      return {
        uploaded: 0,
        skipped: certEntries.length,
        details: {
          skippedCertificates: [
            { name: certName, reason: "Certificate is missing or not in valid PEM format" },
            ...skippedCertificates
          ]
        }
      };
    }

    if (!privateKey || !privateKey.includes("-----BEGIN")) {
      return {
        uploaded: 0,
        skipped: certEntries.length,
        details: {
          skippedCertificates: [
            { name: certName, reason: "Private key is missing or not in valid PEM format" },
            ...skippedCertificates
          ]
        }
      };
    }

    const { hostname, port: credPort } = credentials;
    const port = credPort ?? NUTANIX_DEFAULT_PORT;
    const baseUrl = `https://${hostname}:${port}`;
    const gatewayId = await resolveGateway(pkiSync);

    try {
      // Inside the try so an unsupported key algorithm marks the certificate
      // sync record as failed instead of leaving it in a running state.
      const algo = inferPrivateKeyAlgorithm(cert);

      logger.info(
        { syncId: pkiSync.id, certName, algo, clusterId },
        `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: uploading certificate [certName=${certName}] [clusterId=${clusterId}]`
      );

      await executeNutanixOperationWithGateway(
        {
          gatewayId,
          credentials,
          method: pkiSync.connection.method as NutanixPrismCentralConnectionMethod
        },
        gatewayV2Service,
        async (makeRequest) => {
          const clusterPath = encodeURIComponent(clusterId);

          // Step 1: GET current SSL certificate. Nutanix returns the ETag required
          // for the subsequent PUT (If-Match) as an HTTP response header.
          const getResponse = await makeRequest<unknown>({
            method: "GET",
            url: `${baseUrl}/api/clustermgmt/v4.2/config/clusters/${clusterPath}/ssl-certificate`
          });

          const { etag } = getResponse.headers;

          logger.info(
            { syncId: pkiSync.id, clusterId, hasEtag: Boolean(etag) },
            `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: fetched current SSL certificate for ETag [clusterId=${clusterId}]`
          );

          // Step 2: PUT the new SSL certificate
          const sslCertBody: Record<string, unknown> = {
            privateKeyAlgorithm: algo,
            privateKey: pemToNutanixFormat(privateKey),
            publicCertificate: pemToNutanixFormat(cert),
            $objectType: "clustermgmt.v4.config.SSLCertificate",
            $reserved: { $fv: "v4.r2" }
          };

          if (certificateChain) {
            sslCertBody.caChain = pemToNutanixFormat(certificateChain);
          }

          type TUpdateResponse = {
            data: {
              extId?: string;
            };
          };

          const { data: updateBody } = await makeRequest<TUpdateResponse>({
            method: "PUT",
            url: `${baseUrl}/api/clustermgmt/v4.2/config/clusters/${clusterPath}/ssl-certificate`,
            headers: {
              "Content-Type": "application/json",
              ...(etag ? { "If-Match": etag } : {})
            },
            data: sslCertBody
          });

          const taskExtId = updateBody?.data?.extId;

          logger.info(
            { syncId: pkiSync.id, clusterId, taskExtId },
            `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: certificate update task queued [taskExtId=${taskExtId}]`
          );

          // Step 3: Poll the task until completion
          if (taskExtId) {
            let lastPollError: unknown;

            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
              await new Promise<void>((resolve) => {
                setTimeout(resolve, POLL_INTERVAL_MS);
              });

              try {
                type TTaskResponse = {
                  data: {
                    status?: string;
                    errorDetails?: unknown[];
                  };
                };

                const { data: taskBody } = await makeRequest<TTaskResponse>({
                  method: "GET",
                  url: `${baseUrl}/api/prism/v4.0/config/tasks/${encodeURIComponent(taskExtId)}`
                });

                lastPollError = undefined;
                const status = taskBody?.data?.status;

                logger.debug(
                  { syncId: pkiSync.id, taskExtId, status, attempt },
                  `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: polling task status [taskExtId=${taskExtId}]`
                );

                if (status === "SUCCEEDED") return;

                if (status === "FAILED" || status === "CANCELED" || status === "ABORTED") {
                  const details = JSON.stringify(taskBody?.data?.errorDetails ?? []);
                  throw new PkiSyncError({
                    shouldRetry: false,
                    message: `Nutanix certificate update task ${taskExtId} failed with status ${status}: ${details}`
                  });
                }
              } catch (err) {
                if (err instanceof PkiSyncError) throw err;
                lastPollError = err;
                logger.warn(
                  { syncId: pkiSync.id, taskExtId, err },
                  `Nutanix Prism Central PKI sync [syncId=${pkiSync.id}]: transient error polling task, will retry [taskExtId=${taskExtId}]`
                );
              }
            }

            if (lastPollError) {
              throw new PkiSyncError({
                shouldRetry: false,
                message: `Failed to poll Nutanix task status for ${taskExtId} -- verify the certificate was applied in Prism Central`
              });
            }

            throw new PkiSyncError({
              shouldRetry: false,
              message: `Nutanix certificate update task ${taskExtId} did not complete within the polling window -- check Prism Central task status`
            });
          }
        }
      );

      if (certificateId) {
        const existingSyncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
        if (existingSyncRecord) {
          await certificateSyncDAL.updateById(existingSyncRecord.id, {
            externalIdentifier: clusterId,
            syncStatus: CertificateSyncStatus.Succeeded,
            lastSyncedAt: new Date()
          });
        } else {
          await certificateSyncDAL.addCertificates(pkiSync.id, [{ certificateId, externalIdentifier: clusterId }]);
        }

        const currentCertificate = await certificateDAL.findById(certificateId);
        if (currentCertificate?.renewedFromCertificateId) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, [currentCertificate.renewedFromCertificateId]);
        }
      }

      return {
        uploaded: 1,
        skipped,
        ...(skippedCertificates.length ? { details: { skippedCertificates } } : {})
      };
    } catch (error) {
      let message = "Unknown error";
      if (error instanceof AxiosError) {
        message = String((error.response?.data as { message?: string })?.message || error.message);
      } else if (error instanceof Error) {
        message = error.message;
      }

      if (certificateId) {
        await certificateSyncDAL.updateSyncStatus(
          pkiSync.id,
          certificateId,
          CertificateSyncStatus.Failed,
          `Failed to upload certificate to Nutanix cluster ${clusterId}: ${message}`
        );
      }

      // Preserve the retry semantics of errors thrown inside the operation
      // (e.g. non-retryable post-PUT poll failures). Transient network/API
      // errors fall through to a retryable PkiSyncError, matching other syncs.
      if (error instanceof PkiSyncError) throw error;

      throw new PkiSyncError({
        message: `Failed to upload certificate to Nutanix Prism Central cluster ${clusterId}: ${message}`,
        cause: error instanceof Error ? error : undefined
      });
    }
  };

  return { syncCertificates };
};
