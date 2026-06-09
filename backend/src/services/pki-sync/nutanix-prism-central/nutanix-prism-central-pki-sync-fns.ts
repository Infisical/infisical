/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";

import { logger } from "@app/lib/logger";
import { NutanixPrismCentralConnectionMethod } from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-enums";
import { buildNutanixApiClient } from "@app/services/app-connection/nutanix-prism-central/nutanix-prism-central-connection-fns";
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
};

const getNutanixCredentials = (pkiSync: TPkiSyncWithCredentials): TNutanixCredentials => {
  const credentials = pkiSync.connection.credentials as TNutanixCredentials;
  if (!credentials?.hostname) {
    throw new PkiSyncError({
      message: "Nutanix Prism Central credentials (hostname) not found in connection credentials"
    });
  }
  return credentials;
};

// Nutanix Prism Central only accepts these four algorithm values.
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

// Nutanix API v4 base64-decodes the field value server-side before parsing it as PEM.
// So the correct format is base64(PEM string) — i.e. the full PEM including headers, base64-encoded.
const pemToNutanixFormat = (pem: string): string => Buffer.from(pem.trim()).toString("base64");

// Minimal SDK-compatible response class for the Prism v4 tasks endpoint.
// The clustermgmt ApiClient's _deserialize calls returnType.constructFromObject(body),
// and addEtagToReservedMap calls data.getData() — both must exist on the returned instance.
class NutanixTaskResponse {
  private data: unknown;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly reservedMap: Record<string, any> = {};

  static constructFromObject(raw: unknown) {
    const instance = new NutanixTaskResponse();
    // Prism v4 task response: { data: { status, errorDetails, ... }, ... }
    instance.data = (raw as { data?: unknown })?.data;
    return instance;
  }

  getData() {
    return this.data as { status?: string; errorDetails?: unknown[] } | undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get$Reserved(): Record<string, any> {
    return this.reservedMap;
  }
}

// Poll the Nutanix Prism v4 tasks endpoint until the task completes or times out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pollNutanixTask = async (apiClient: any, taskExtId: string, syncId: string): Promise<void> => {
  const POLL_INTERVAL_MS = 3000;
  const MAX_ATTEMPTS = 20; // ~60 s total

  let lastPollError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });

    try {
      // Use the SDK's ApiClient so auth headers are applied automatically.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const result = await apiClient.callApi(
        "/api/prism/v4.0/config/tasks/{taskExtId}",
        "GET",
        { taskExtId },
        {},
        {},
        {},
        null,
        ["apiKeyAuthScheme", "basicAuthScheme"],
        ["application/json"],
        ["application/json"],
        NutanixTaskResponse
      );

      lastPollError = undefined;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const taskData = (result as { data?: NutanixTaskResponse })?.data?.getData?.();
      const status = taskData?.status;
      logger.debug({ syncId, taskExtId, status, attempt }, "[nutanix-pki-sync] Polling task status");

      if (status === "SUCCEEDED") return;

      if (status === "FAILED" || status === "CANCELED" || status === "ABORTED") {
        const details = JSON.stringify(taskData?.errorDetails ?? []);
        throw new PkiSyncError({
          shouldRetry: false,
          message: `Nutanix certificate update task ${taskExtId} failed with status ${status}: ${details}`
        });
      }
    } catch (err) {
      if (err instanceof PkiSyncError) throw err;
      lastPollError = err;
      logger.warn({ syncId, taskExtId, err }, "[nutanix-pki-sync] Transient error polling task — will retry");
    }
  }

  if (lastPollError) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `Failed to poll Nutanix task status for ${taskExtId} — verify the certificate was applied in Prism Central`
    });
  }

  // Task was reachable but didn't complete within the timeout window
  throw new PkiSyncError({
    shouldRetry: false,
    message: `Nutanix certificate update task ${taskExtId} did not complete within the polling window — check Prism Central task status`
  });
};

export const nutanixPrismCentralPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL
}: TNutanixPrismCentralPkiSyncFactoryDeps) => {
  const syncCertificates = async (pkiSync: TPkiSyncWithCredentials, certificateMap: TCertificateMap) => {
    const credentials = getNutanixCredentials(pkiSync);
    const destinationConfig = pkiSync.destinationConfig as TNutanixPrismCentralPkiSyncConfig;
    const { clusterId } = destinationConfig;

    if (!clusterId) {
      throw new PkiSyncError({ message: "Nutanix cluster ID is required in destination config" });
    }

    // Collect all certificate entries and select the newest one by notAfter
    const certEntries = Object.entries(certificateMap);
    if (certEntries.length === 0) {
      return { uploaded: 0, skipped: 0 };
    }

    // Sort by certificate notAfter date descending to pick the newest
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

    if (sortedEntries.length > 1) {
      logger.info(
        { syncId: pkiSync.id, chosen: certName, totalCerts: certEntries.length },
        `[nutanix-pki-sync] Multiple certificates found — selected newest [certName=${certName}]`
      );
    }

    // Validate PEM content
    if (!cert || !cert.includes("-----BEGIN CERTIFICATE-----")) {
      return {
        uploaded: 0,
        skipped: certEntries.length,
        details: {
          skippedCertificates: [{ name: certName, reason: "Certificate is missing or not in valid PEM format" }]
        }
      };
    }

    if (!privateKey || !privateKey.includes("-----BEGIN")) {
      return {
        uploaded: 0,
        skipped: certEntries.length,
        details: {
          skippedCertificates: [{ name: certName, reason: "Private key is missing or not in valid PEM format" }]
        }
      };
    }

    const algo = inferPrivateKeyAlgorithm(cert);

    logger.info(
      { syncId: pkiSync.id, certName, algo, clusterId },
      `[nutanix-pki-sync] Uploading certificate to Nutanix cluster [syncId=${pkiSync.id}]`
    );

    try {
      const { SSLCertificateApi } = await import("@nutanix-api/clustermgmt-js-client/dist/es");
      const apiClient = await buildNutanixApiClient(
        credentials,
        pkiSync.connection.method as NutanixPrismCentralConnectionMethod
      );
      const sslApi = new SSLCertificateApi(apiClient);

      // Nutanix v4 API requires an ETag (If-Match header) for PUT operations.
      // Fetch the current certificate first; the SDK stores the ETag from the response
      // headers into the deserialized data object's $reserved map via addEtagToReservedMap.
      const getResponse = await sslApi.getSSLCertificate(clusterId);

      // getResponse resolves as { data: GetSSLCertificateApiResponse, response: RawHttpResponse }
      // The SDK stores the ETag in: data.getData().get$Reserved()["ETag"]
      type TApiResponse = { data: { getData: () => { get$Reserved: () => Record<string, string> } } };
      const getApiResponse = getResponse as unknown as TApiResponse;
      const etag = getApiResponse?.data?.getData?.()?.get$Reserved?.()?.ETag;
      logger.info(
        { syncId: pkiSync.id, clusterId, hasEtag: Boolean(etag) },
        "[nutanix-pki-sync] Fetched current SSL certificate for ETag"
      );

      // Build the SSLCertificate payload using the SDK model.
      const { default: SSLCertificate } = await import(
        "@nutanix-api/clustermgmt-js-client/dist/es/models/clustermgmt/v4/config/SSLCertificate"
      );
      const sslCertBody = new SSLCertificate(algo);
      sslCertBody.setPrivateKeyAlgorithm(algo);
      sslCertBody.setPrivateKey(pemToNutanixFormat(privateKey));
      sslCertBody.setPublicCertificate(pemToNutanixFormat(cert));

      if (certificateChain) {
        sslCertBody.setCaChain(pemToNutanixFormat(certificateChain));
      }

      // Set ETag on the body — the SDK reads sslCertBody.$reserved.ETag in
      // addEtagReferenceToHeader() and adds it as the If-Match header on the PUT request.
      if (etag) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        (sslCertBody as any).$reserved = { ...((sslCertBody as any).$reserved ?? {}), ETag: etag };
      }

      const updateResponse = await sslApi.updateSSLCertificate(clusterId, sslCertBody);

      // The 202 response contains a TaskReference with extId — poll until the task completes.
      type TUpdateResponse = { data: { getData: () => { getExtId?: () => string } } };
      const taskRef = (updateResponse as unknown as TUpdateResponse)?.data?.getData?.();
      const taskExtId = taskRef?.getExtId?.();

      logger.info(
        { syncId: pkiSync.id, clusterId, taskExtId },
        "[nutanix-pki-sync] Certificate update task queued — polling for completion"
      );

      if (taskExtId) {
        await pollNutanixTask(apiClient, taskExtId, pkiSync.id);
      }

      // Update certificate sync record
      if (certificateId) {
        const existingSyncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
        if (existingSyncRecord) {
          await certificateSyncDAL.updateById(existingSyncRecord.id, {
            syncStatus: CertificateSyncStatus.Succeeded,
            lastSyncedAt: new Date()
          });
        } else {
          await certificateSyncDAL.addCertificates(pkiSync.id, [{ certificateId }]);
        }

        const currentCertificate = await certificateDAL.findById(certificateId);
        if (currentCertificate?.renewedFromCertificateId) {
          // Remove the old cert's sync record so the UI only shows the current certificate.
          // Nutanix has one slot per cluster so no destination-side deletion is needed.
          await certificateSyncDAL.removeCertificates(pkiSync.id, [currentCertificate.renewedFromCertificateId]);
        }
      }

      return { uploaded: 1, skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (certificateId) {
        await certificateSyncDAL.updateSyncStatus(
          pkiSync.id,
          certificateId,
          CertificateSyncStatus.Failed,
          `Failed to upload certificate to Nutanix cluster ${clusterId}: ${message}`
        );
      }

      throw new PkiSyncError({
        shouldRetry: false,
        message: `Failed to upload certificate to Nutanix Prism Central cluster ${clusterId}: ${message}`,
        cause: error instanceof Error ? error : undefined
      });
    }
  };

  return { syncCertificates };
};
