import * as x509 from "@peculiar/x509";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { createLogThrottle, formatSuppressed } from "@app/lib/logger/log-throttle";
import {
  recordOcspResponseMetric,
  recordOcspSigningDurationMetric,
  TOcspResponseResultLabel
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
  OCSP_GENERATION_TTL_SECONDS,
  OCSP_HASH_NAME_BY_OID,
  OCSP_LOG_THROTTLE_WINDOW_MS,
  OCSP_MAX_CACHED_CA_CERTIFICATES,
  OCSP_MAX_CERT_IDS_PER_CACHED_REQUEST,
  OCSP_MAX_CONCURRENT_SIGNATURES,
  OCSP_MAX_CONCURRENT_SIGNATURES_PER_CA,
  OCSP_MAX_TRACKED_CA_LIMITERS,
  OCSP_MAX_TRACKED_LOG_KEYS,
  OCSP_RESPONSE_VALIDITY_SECONDS,
  OCSP_SATURATION_LOGS_PER_WINDOW,
  OCSP_SIGNING_MAX_QUEUE_DEPTH,
  OCSP_SIGNING_QUEUE_TIMEOUT_MS,
  OCSP_UNKNOWN_RESPONSE_VALIDITY_SECONDS,
  OcspCertStatus,
  OcspResponseStatus,
  STORED_SERIAL_HEX_LENGTH
} from "./certificate-authority-ocsp-enums";
import {
  buildOcspErrorResponse,
  buildOcspRequestFingerprint,
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
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "find" | "primaryNode">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "sign">;
  keyStore: Pick<
    TKeyStoreFactory,
    "getItemPrimary" | "setItemWithExpiry" | "deleteItemsByKeyIn" | "incrementSeededWithExpiry" | "deleteItems"
  >;
};

const OCSP_CACHE_PREFIX = "ocsp-response";
const OCSP_MULTI_CACHE_PREFIX = "ocsp-response-multi";
const OCSP_GENERATION_PREFIX = "ocsp-generation";

const buildCacheKey = (caCertId: string, hashAlgorithmOid: string, serialNumber: string) =>
  `${OCSP_CACHE_PREFIX}:${caCertId}:${hashAlgorithmOid}:${serialNumber}`;

const buildGenerationKey = (caId: string) => `${OCSP_GENERATION_PREFIX}:${caId}`;

const buildMultiCacheKey = (caCertId: string, generation: string, entries: TParsedOcspRequestEntry[]) =>
  `${OCSP_MULTI_CACHE_PREFIX}:${caCertId}:${generation}:${buildOcspRequestFingerprint(entries)}`;

type TCaOcspIdentifiers = ReturnType<typeof getCaOcspIdentifiers>;

type TResolvedCaCertificate = {
  id: string;
  certificate: x509.X509Certificate;
  caId: string;
  identifiers: Map<string, TCaOcspIdentifiers>;
};

const caCertificateCache = new Map<string, TResolvedCaCertificate>();

const inFlightResponses = new Map<string, Promise<{ result: TOcspResponseResult; label: TOcspResponseResultLabel }>>();

const saturationLogThrottle = createLogThrottle({
  windowMs: OCSP_LOG_THROTTLE_WINDOW_MS,
  maxPerWindow: OCSP_SATURATION_LOGS_PER_WINDOW,
  maxTrackedKeys: OCSP_MAX_TRACKED_LOG_KEYS
});

const signingLimiters = createOcspSigningLimiterRegistry({
  globalLimit: OCSP_MAX_CONCURRENT_SIGNATURES,
  perCaLimit: OCSP_MAX_CONCURRENT_SIGNATURES_PER_CA,
  maxWaitMs: OCSP_SIGNING_QUEUE_TIMEOUT_MS,
  maxQueueDepth: OCSP_SIGNING_MAX_QUEUE_DEPTH,
  maxTrackedCas: OCSP_MAX_TRACKED_CA_LIMITERS
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

  const $toResultLabel = (kinds: OcspCertStatus[]): TOcspResponseResultLabel => {
    if (kinds.some((kind) => kind === OcspCertStatus.Revoked)) return "revoked";
    if (kinds.some((kind) => kind === OcspCertStatus.Unknown)) return "unknown";
    return "good";
  };

  const getOcspResponse: TCertificateAuthorityOcspServiceFactory["getOcspResponse"] = async ({ caId, requestDer }) => {
    const parsed = parseOcspRequest(requestDer);
    if (!parsed) {
      recordOcspResponseMetric({ result: "malformed_request", cache: "skipped" });
      return { response: buildOcspErrorResponse(OcspResponseStatus.MalformedRequest), maxAgeSeconds: 0 };
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId).catch((error) => {
      if (error instanceof NotFoundError) return null;
      throw error;
    });

    if (!ca?.internalCa?.id || !ca.internalCa.activeCaCertId) {
      recordOcspResponseMetric({ result: "unauthorized", cache: "skipped" });
      return { response: buildOcspErrorResponse(OcspResponseStatus.Unauthorized), maxAgeSeconds: 0 };
    }

    const { isOcspEnabled } = ca.internalCa;

    const activeCaCert = await $getActiveCaCertificate(ca.id, ca.projectId, ca.internalCa.activeCaCertId);
    if (!activeCaCert) {
      recordOcspResponseMetric({ result: "unauthorized", cache: "skipped" });
      return { response: buildOcspErrorResponse(OcspResponseStatus.Unauthorized), maxAgeSeconds: 0 };
    }

    for (const entry of parsed.entries) {
      const identifiers = $getIdentifiers(activeCaCert, entry.hashAlgorithmOid);
      if (
        !identifiers ||
        !identifiers.issuerNameHash.equals(entry.issuerNameHash) ||
        !identifiers.issuerKeyHash.equals(entry.issuerKeyHash)
      ) {
        recordOcspResponseMetric({ result: "unauthorized", cache: "skipped" });
        return { response: buildOcspErrorResponse(OcspResponseStatus.Unauthorized), maxAgeSeconds: 0 };
      }
    }

    const generationKey = buildGenerationKey(ca.id);
    const generationAtStart = (await keyStore.getItemPrimary(generationKey)) ?? "0";

    const $resolveCacheKey = () => {
      if (parsed.nonce) return null;

      if (parsed.entries.length === 1) {
        return buildCacheKey(activeCaCert.id, parsed.entries[0].hashAlgorithmOid, parsed.entries[0].serialNumber);
      }

      if (parsed.entries.length > OCSP_MAX_CERT_IDS_PER_CACHED_REQUEST) return null;

      return buildMultiCacheKey(activeCaCert.id, generationAtStart, parsed.entries);
    };

    const cacheKey = $resolveCacheKey();

    if (cacheKey) {
      const cached = await keyStore.getItemPrimary(cacheKey);
      if (cached) {
        const { der, expiresAt, result } = JSON.parse(cached) as {
          der: string;
          expiresAt: number;
          result: TOcspResponseResultLabel;
        };
        const remaining = Math.floor((expiresAt - Date.now()) / 1000);
        if (remaining > 0) {
          recordOcspResponseMetric({ result, cache: "hit" });
          return { response: Buffer.from(der, "base64"), maxAgeSeconds: remaining };
        }
      }
    }

    const $produce = async (): Promise<{ result: TOcspResponseResult; label: TOcspResponseResultLabel }> => {
      const thisUpdate = new Date();
      thisUpdate.setMilliseconds(0);

      const signingStartedAt = Date.now();
      let resolvedResultLabel: TOcspResponseResultLabel = "unknown";
      let validitySeconds = OCSP_RESPONSE_VALIDITY_SECONDS;
      let nextUpdate = new Date(thisUpdate.getTime() + validitySeconds * 1000);

      const response = await signingLimiters.runForCa(ca.id, async () => {
        const statuses = isOcspEnabled
          ? await $resolveStatuses(ca.id, parsed.entries)
          : parsed.entries.map((entry) => ({ entry, status: { kind: OcspCertStatus.Unknown } as TOcspCertStatus }));
        resolvedResultLabel = $toResultLabel(statuses.map(({ status }) => status.kind));

        if (resolvedResultLabel === "unknown") {
          validitySeconds = OCSP_UNKNOWN_RESPONSE_VALIDITY_SECONDS;
          nextUpdate = new Date(thisUpdate.getTime() + validitySeconds * 1000);
        }

        const { signer } = await getCaSigner({
          caId: ca.id,
          certificateAuthorityDAL,
          certificateAuthoritySecretDAL,
          projectDAL,
          kmsService,
          hsmConnectorService
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
        const { shouldLog, suppressed } = saturationLogThrottle.take(ca.id);
        if (shouldLog) {
          logger.warn(
            `OCSP responder saturated, shedding request [caId=${ca.id}] [caQueueDepth=${signingLimiters.getCaQueueDepth(
              ca.id
            )}] [globalQueueDepth=${signingLimiters.getGlobalQueueDepth()}]${formatSuppressed(suppressed)}`
          );
        }
        recordOcspResponseMetric({ result: "try_later", cache: cacheKey ? "miss" : "skipped" });
        return {
          result: { response: buildOcspErrorResponse(OcspResponseStatus.TryLater), maxAgeSeconds: 0 },
          label: "try_later"
        };
      }

      recordOcspSigningDurationMetric({ durationMs: Date.now() - signingStartedAt });
      recordOcspResponseMetric({ result: resolvedResultLabel, cache: cacheKey ? "miss" : "skipped" });

      if (cacheKey) {
        const generationNow = (await keyStore.getItemPrimary(generationKey)) ?? "0";
        if (generationNow === generationAtStart) {
          await keyStore.setItemWithExpiry(
            cacheKey,
            validitySeconds,
            JSON.stringify({
              der: response.toString("base64"),
              expiresAt: nextUpdate.getTime(),
              result: resolvedResultLabel
            })
          );
        }
      }

      return {
        result: { response, maxAgeSeconds: parsed.nonce ? 0 : validitySeconds },
        label: resolvedResultLabel
      };
    };

    if (!cacheKey) return (await $produce()).result;

    const inFlightKey = `${cacheKey}:${generationAtStart}`;

    const inFlight = inFlightResponses.get(inFlightKey);
    if (inFlight) {
      const { result, label } = await inFlight;
      recordOcspResponseMetric({ result: label, cache: "coalesced" });
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

  const invalidateCachedResponse: TCertificateAuthorityOcspServiceFactory["invalidateCachedResponse"] = async ({
    caId,
    serialNumber
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    const activeCaCertId = ca?.internalCa?.activeCaCertId;
    if (!activeCaCertId) return;

    const normalized = normalizeSerialNumber(serialNumber);
    const keys = Object.keys(OCSP_HASH_NAME_BY_OID).map((oid) => buildCacheKey(activeCaCertId, oid, normalized));

    await keyStore.incrementSeededWithExpiry(buildGenerationKey(caId), Date.now(), OCSP_GENERATION_TTL_SECONDS);
    await keyStore.deleteItemsByKeyIn(keys);
  };

  const invalidateAllCachedResponsesForCa: TCertificateAuthorityOcspServiceFactory["invalidateAllCachedResponsesForCa"] =
    async ({ caId }) => {
      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
      const activeCaCertId = ca?.internalCa?.activeCaCertId;
      if (!activeCaCertId) return;

      await keyStore.incrementSeededWithExpiry(buildGenerationKey(caId), Date.now(), OCSP_GENERATION_TTL_SECONDS);
      await keyStore.deleteItems({ pattern: `${OCSP_CACHE_PREFIX}:${activeCaCertId}:*` });
    };

  return { getOcspResponse, invalidateCachedResponse, invalidateAllCachedResponsesForCa };
};
