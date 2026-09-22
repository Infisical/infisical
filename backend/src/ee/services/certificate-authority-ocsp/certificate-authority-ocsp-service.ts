import * as x509 from "@peculiar/x509";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordOcspResponseMetric,
  recordOcspSigningDurationMetric,
  TOcspCertStatusLabel,
  TOcspStatusLabel
} from "@app/lib/telemetry/metrics";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaSigner } from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import {
  OCSP_MAX_CACHED_CA_CERTIFICATES,
  OCSP_MAX_CONCURRENT_SIGNATURES,
  OCSP_MAX_CONCURRENT_SIGNATURES_PER_CA,
  OCSP_MAX_TRACKED_CA_LIMITERS,
  OCSP_RESPONSE_VALIDITY_SECONDS,
  OCSP_SATURATION_LOG_INTERVAL_MS,
  OCSP_SIGNING_MAX_QUEUE_DEPTH,
  OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT,
  OCSP_SIGNING_QUEUE_TIMEOUT_MS,
  OCSP_UNKNOWN_RESPONSE_VALIDITY_SECONDS,
  OcspCertStatus,
  OcspResponseStatus,
  STORED_SERIAL_HEX_LENGTH
} from "./certificate-authority-ocsp-enums";
import {
  buildOcspErrorResponse,
  buildSignedOcspResponse,
  getCaOcspIdentifiers,
  normalizeSerialNumber,
  parseOcspRequest
} from "./certificate-authority-ocsp-fns";
import { createOcspSigningLimiterRegistry } from "./certificate-authority-ocsp-limiter";
import {
  TCertificateAuthorityOcspServiceFactory,
  TOcspCertStatus,
  TOcspResponseResult,
  TParsedOcspRequestEntry
} from "./certificate-authority-ocsp-types";

type TCertificateAuthorityOcspServiceFactoryDep = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa" | "primaryNode">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "primaryNode">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "sign">;
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "setItemWithExpiry">;
};

const OCSP_CACHE_PREFIX = "ocsp-response";

const buildCacheKey = (caCertId: string, hashAlgorithmOid: string, serialNumber: string) =>
  `${OCSP_CACHE_PREFIX}:${caCertId}:${hashAlgorithmOid}:${serialNumber}`;

type TCaOcspIdentifiers = ReturnType<typeof getCaOcspIdentifiers>;

type TResolvedCaCertificate = {
  id: string;
  certificate: x509.X509Certificate;
  caId: string;
  kmsKeyId: string;
  identifiers: Map<string, TCaOcspIdentifiers>;
};

const caCertificateCache = new Map<string, TResolvedCaCertificate>();

type TOcspOutcome = { result: TOcspResponseResult; status: TOcspStatusLabel; certStatus: TOcspCertStatusLabel };

const inFlightResponses = new Map<string, Promise<TOcspOutcome>>();

let lastSaturationLogAt = 0;

const signingLimiters = createOcspSigningLimiterRegistry({
  globalLimit: OCSP_MAX_CONCURRENT_SIGNATURES,
  perCaLimit: OCSP_MAX_CONCURRENT_SIGNATURES_PER_CA,
  maxWaitMs: OCSP_SIGNING_QUEUE_TIMEOUT_MS,
  maxQueueDepth: OCSP_SIGNING_MAX_QUEUE_DEPTH,
  maxTrackedCas: OCSP_MAX_TRACKED_CA_LIMITERS,
  maxTotalInFlight: OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT
});

export const certificateAuthorityOcspServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateDAL,
  projectDAL,
  kmsService,
  hsmConnectorService,
  keyStore
}: TCertificateAuthorityOcspServiceFactoryDep): TCertificateAuthorityOcspServiceFactory => {
  const $getActiveCaCertificate = async (caId: string, projectId: string, activeCaCertId: string) => {
    const cached = caCertificateCache.get(activeCaCertId);
    if (cached) return cached;

    const caCert = await certificateAuthorityCertDAL.findById(activeCaCertId);
    if (!caCert) return null;

    const keyId = await getProjectKmsCertificateKeyId({ projectId, projectDAL, kmsService });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({ kmsId: keyId });
    const decryptedCaCert = await kmsDecryptor({ cipherTextBlob: caCert.encryptedCertificate });

    const resolved: TResolvedCaCertificate = {
      id: caCert.id,
      certificate: new x509.X509Certificate(decryptedCaCert),
      caId,
      kmsKeyId: keyId,
      identifiers: new Map()
    };

    if (caCertificateCache.size >= OCSP_MAX_CACHED_CA_CERTIFICATES) {
      const oldest = caCertificateCache.keys().next().value as string | undefined;
      if (oldest) caCertificateCache.delete(oldest);
    }
    caCertificateCache.set(activeCaCertId, resolved);

    return resolved;
  };

  const $getIdentifiers = (caCertificate: TResolvedCaCertificate, hashAlgorithmOid: string) => {
    if (caCertificate.identifiers.has(hashAlgorithmOid)) {
      return caCertificate.identifiers.get(hashAlgorithmOid) ?? null;
    }

    const identifiers = getCaOcspIdentifiers(caCertificate.certificate, hashAlgorithmOid);
    caCertificate.identifiers.set(hashAlgorithmOid, identifiers);

    return identifiers;
  };

  const $resolveStatuses = async (caId: string, entries: TParsedOcspRequestEntry[]) => {
    const serialNumbers = [
      ...new Set(
        entries.flatMap((entry) => [
          entry.rawSerialNumber,
          entry.serialNumber,
          entry.serialNumber.padStart(STORED_SERIAL_HEX_LENGTH, "0")
        ])
      )
    ];
    const certificates = await certificateDAL.find(
      { caId, $in: { serialNumber: serialNumbers } },
      { tx: certificateDAL.primaryNode() }
    );

    const bySerial = new Map(
      certificates.map((certificate) => [normalizeSerialNumber(certificate.serialNumber), certificate])
    );

    return entries.map((entry) => {
      const certificate = bySerial.get(entry.serialNumber);

      if (!certificate) return { entry, status: { kind: OcspCertStatus.Unknown } as TOcspCertStatus };

      if (certificate.status === CertStatus.REVOKED) {
        return {
          entry,
          status: {
            kind: OcspCertStatus.Revoked,
            revokedAt: certificate.revokedAt ?? new Date(0),
            ...(typeof certificate.revocationReason === "number" ? { reason: certificate.revocationReason } : {})
          } as TOcspCertStatus
        };
      }

      return { entry, status: { kind: OcspCertStatus.Good } as TOcspCertStatus };
    });
  };

  const $toCertStatusLabel = (kinds: OcspCertStatus[]): TOcspCertStatusLabel => {
    if (kinds.some((kind) => kind === OcspCertStatus.Revoked)) return "revoked";
    if (kinds.some((kind) => kind === OcspCertStatus.Unknown)) return "unknown";
    return "good";
  };

  const $resolveAuthoritativeCa = async (caId: string, entries: TParsedOcspRequestEntry[]) => {
    const ca = await certificateAuthorityDAL
      .findByIdWithAssociatedCa(caId, certificateAuthorityDAL.primaryNode())
      .catch((error) => {
        if (error instanceof NotFoundError) return null;
        throw error;
      });

    if (!ca?.internalCa?.id || !ca.internalCa.isOcspEnabled || !ca.internalCa.activeCaCertId) return null;

    const activeCaCert = await $getActiveCaCertificate(ca.id, ca.projectId, ca.internalCa.activeCaCertId);
    if (!activeCaCert) return null;

    const issuedByThisCa = entries.every((entry) => {
      const identifiers = $getIdentifiers(activeCaCert, entry.hashAlgorithmOid);
      return (
        identifiers &&
        identifiers.issuerNameHash.equals(entry.issuerNameHash) &&
        identifiers.issuerKeyHash.equals(entry.issuerKeyHash)
      );
    });
    if (!issuedByThisCa) return null;

    return { ca, activeCaCert, generation: String(ca.internalCa.ocspGeneration) };
  };

  const getOcspResponse: TCertificateAuthorityOcspServiceFactory["getOcspResponse"] = async ({ caId, requestDer }) => {
    const parsed = parseOcspRequest(requestDer);
    if (!parsed) {
      recordOcspResponseMetric({ status: "malformed_request", certStatus: "none", cache: "skipped" });
      return { response: buildOcspErrorResponse(OcspResponseStatus.MalformedRequest), maxAgeSeconds: 0 };
    }

    const authoritative = await $resolveAuthoritativeCa(caId, parsed.entries);
    if (!authoritative) {
      recordOcspResponseMetric({ status: "unauthorized", certStatus: "none", cache: "skipped" });
      return { response: buildOcspErrorResponse(OcspResponseStatus.Unauthorized), maxAgeSeconds: 0 };
    }

    const { ca, activeCaCert, generation: generationAtStart } = authoritative;

    const cacheKey =
      parsed.nonce || parsed.entries.length !== 1
        ? null
        : buildCacheKey(activeCaCert.id, parsed.entries[0].hashAlgorithmOid, parsed.entries[0].serialNumber);

    if (cacheKey) {
      const cached = await keyStore.getItemPrimary(cacheKey);
      if (cached) {
        const { der, expiresAt, certStatus, generation } = JSON.parse(cached) as {
          der: string;
          expiresAt: number;
          certStatus: TOcspCertStatusLabel;
          generation: string;
        };
        const remaining = Math.floor((expiresAt - Date.now()) / 1000);
        if (remaining > 0 && generation === generationAtStart) {
          recordOcspResponseMetric({ status: "successful", certStatus, cache: "hit" });
          return { response: Buffer.from(der, "base64"), maxAgeSeconds: remaining };
        }
      }
    }

    const $produce = async (): Promise<TOcspOutcome> => {
      const thisUpdate = new Date();
      thisUpdate.setMilliseconds(0);

      const signingStartedAt = Date.now();
      let resolvedCertStatus: TOcspCertStatusLabel = "unknown";
      let validitySeconds = OCSP_RESPONSE_VALIDITY_SECONDS;
      let nextUpdate = new Date(thisUpdate.getTime() + validitySeconds * 1000);

      const response = await signingLimiters.runForCa(ca.id, async () => {
        const statuses = await $resolveStatuses(ca.id, parsed.entries);
        resolvedCertStatus = $toCertStatusLabel(statuses.map(({ status }) => status.kind));

        if (resolvedCertStatus === "unknown") {
          validitySeconds = OCSP_UNKNOWN_RESPONSE_VALIDITY_SECONDS;
          nextUpdate = new Date(thisUpdate.getTime() + validitySeconds * 1000);
        }

        const { signer } = await getCaSigner({
          caId: ca.id,
          certificateAuthorityDAL,
          certificateAuthoritySecretDAL,
          projectDAL,
          kmsService,
          hsmConnectorService,
          prefetched: { kmsKeyId: activeCaCert.kmsKeyId }
        });

        return buildSignedOcspResponse({
          signer,
          caCertificate: activeCaCert.certificate,
          statuses,
          thisUpdate,
          nextUpdate,
          ...(parsed.nonce ? { nonce: parsed.nonce } : {})
        });
      });

      if (!response) {
        if (Date.now() - lastSaturationLogAt > OCSP_SATURATION_LOG_INTERVAL_MS) {
          lastSaturationLogAt = Date.now();
          logger.warn(
            `OCSP responder saturated, shedding request [caId=${ca.id}] [caQueueDepth=${signingLimiters.getCaQueueDepth(
              ca.id
            )}] [globalQueueDepth=${signingLimiters.getGlobalQueueDepth()}]`
          );
        }
        recordOcspResponseMetric({ status: "try_later", certStatus: "none", cache: cacheKey ? "miss" : "skipped" });
        return {
          result: { response: buildOcspErrorResponse(OcspResponseStatus.TryLater), maxAgeSeconds: 0 },
          status: "try_later",
          certStatus: "none"
        };
      }

      recordOcspSigningDurationMetric({ durationMs: Date.now() - signingStartedAt });
      recordOcspResponseMetric({
        status: "successful",
        certStatus: resolvedCertStatus,
        cache: cacheKey ? "miss" : "skipped"
      });

      if (cacheKey) {
        await keyStore.setItemWithExpiry(
          cacheKey,
          validitySeconds,
          JSON.stringify({
            der: response.toString("base64"),
            expiresAt: nextUpdate.getTime(),
            generation: generationAtStart,
            certStatus: resolvedCertStatus
          })
        );
      }

      return {
        result: { response, maxAgeSeconds: parsed.nonce ? 0 : validitySeconds },
        status: "successful",
        certStatus: resolvedCertStatus
      };
    };

    if (!cacheKey) return (await $produce()).result;

    const inFlightKey = `${cacheKey}:${generationAtStart}`;

    const inFlight = inFlightResponses.get(inFlightKey);
    if (inFlight) {
      const { result, status, certStatus } = await inFlight;
      recordOcspResponseMetric({ status, certStatus, cache: "coalesced" });
      return result;
    }

    const pending = $produce();
    inFlightResponses.set(inFlightKey, pending);

    try {
      return (await pending).result;
    } finally {
      inFlightResponses.delete(inFlightKey);
    }
  };

  return { getOcspResponse };
};
