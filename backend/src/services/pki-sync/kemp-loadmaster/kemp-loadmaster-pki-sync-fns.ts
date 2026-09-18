/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";
import { createHash } from "crypto";
import forge from "node-forge";
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import {
  executeKempLoadMasterOperationWithGateway,
  getKempAuthHeaders,
  getKempBaseUrl,
  parseKempResponse,
  TKempRequestFn
} from "@app/services/app-connection/kemp-loadmaster/kemp-loadmaster-connection-fns";
import { TKempLoadMasterConnection } from "@app/services/app-connection/kemp-loadmaster/kemp-loadmaster-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { buildCertificateBundle, splitPemChain } from "@app/services/certificate/certificate-fns";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import {
  buildManagedCertificateNameRegexSource,
  certificateNameSchemaHasFreeTextPlaceholder,
  compileCertificateNameSchema,
  SHORT_UUID_NAME_REGEX_FRAGMENT,
  UUID_NAME_REGEX_FRAGMENT
} from "../pki-sync-certificate-name-fns";
import { PkiSync } from "../pki-sync-enums";
import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { KEMP_LOADMASTER_DEFAULT_CA_NAME_SCHEMA } from "./kemp-loadmaster-pki-sync-constants";
import { TKempLoadMasterPkiSyncConfig } from "./kemp-loadmaster-pki-sync-types";

type TKempCredentials = TKempLoadMasterConnection["credentials"];

type TKempLoadMasterPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

const getKempCredentials = (pkiSync: TPkiSyncWithCredentials): TKempCredentials => {
  const credentials = pkiSync.connection.credentials as TKempCredentials;
  if (!credentials?.hostname || !credentials?.username || !credentials?.password) {
    throw new PkiSyncError({
      message: "Kemp LoadMaster credentials (hostname, username, password) not found in connection credentials"
    });
  }
  return credentials;
};

const WHITESPACE_SPLIT = new RE2("\\s+");

const extractCertNames = (data: unknown): Set<string> => {
  const names = new Set<string>();
  const certs = (data as { cert?: unknown } | undefined)?.cert;
  if (certs) {
    const list = Array.isArray(certs) ? certs : [certs];
    for (const cert of list) {
      const name = (cert as { name?: unknown })?.name;
      if (name !== undefined && name !== null) {
        names.add(String(name));
      }
    }
  }
  return names;
};

const DASH_GLOBAL = new RE2("-", "g");
const CA_NAME_SANITIZE = new RE2("[^a-zA-Z0-9._-]", "g");
const CA_FINGERPRINT_PLACEHOLDER = new RE2("\\{\\{fingerprint\\}\\}", "g");
const CA_COMMON_NAME_PLACEHOLDER = new RE2("\\{\\{commonName\\}\\}", "g");

// The LoadMaster keeps intermediate/CA certs in a store separate from leaf certs and builds the
// served chain from it.
export const buildIntermediateIdentifier = (certPem: string, nameSchema: string): string => {
  const fingerprint = createHash("sha256").update(certPem.trim()).digest("hex").slice(0, 24);

  let commonName = "ca";
  try {
    const cnField = forge.pki.certificateFromPem(certPem).subject.getField("CN") as { value?: unknown } | null;
    const cn = cnField?.value;
    if (cn) commonName = String(cn);
  } catch {
    // unparseable CA falls back to the generic "ca" label
  }

  return nameSchema
    .replace(CA_FINGERPRINT_PLACEHOLDER, fingerprint)
    .replace(CA_COMMON_NAME_PLACEHOLDER, commonName.replace(CA_NAME_SANITIZE, "-"));
};

const kempError = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    if (error.response?.status === 401) return "invalid username or password";
    if (error.response?.status === 404) return "the LoadMaster API interface is not enabled";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

export const buildManagedCertNamePattern = (certificateNameSchema: string | undefined): RE2 => {
  if (!certificateNameSchema) {
    return new RE2("^Infisical-[0-9a-f]{32}(-[a-zA-Z0-9]*)?$");
  }

  // {{certificateId}}, {{profileId}}, and {{applicationId}} resolve to 32-char dash-stripped UUIDs;
  // {{shortCertificateId}} resolves to a 22-char base62 string.
  // {{commonName}} and {{applicationName}} are arbitrary, so match any run of Kemp-safe characters.
  const pattern = buildManagedCertificateNameRegexSource(certificateNameSchema, {
    uuid: UUID_NAME_REGEX_FRAGMENT,
    shortUuid: SHORT_UUID_NAME_REGEX_FRAGMENT,
    freeText: "[a-zA-Z0-9._-]*"
  });

  return new RE2(`^${pattern}$`);
};

export const kempLoadMasterPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service,
  gatewayPoolService
}: TKempLoadMasterPkiSyncFactoryDeps) => {
  const resolveGateway = async (pkiSync: TPkiSyncWithCredentials) => {
    return gatewayPoolService
      ? gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: pkiSync.connection.gatewayId,
          gatewayPoolId: pkiSync.connection.gatewayPoolId
        })
      : (pkiSync.connection.gatewayId ?? null);
  };

  const listCertificateIdentifiers = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<Set<string>> => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/listcert`,
      headers,
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new PkiSyncError({
        message: `Failed to list certificates on Kemp LoadMaster: ${parsed.error || "unexpected response"}`,
        shouldRetry: true
      });
    }

    return extractCertNames(parsed.data);
  };

  const upsertCertificate = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    identifier: string,
    bundle: string,
    exists: boolean
  ): Promise<void> => {
    // The LoadMaster rejects replace=1 for an identifier that does not yet exist, so replace is only
    // set when the identifier is already present.
    const replaceParam = exists ? "&replace=1" : "";
    const payload = await makeRequest<string>({
      method: "POST",
      url: `${baseUrl}/access/addcert?cert=${encodeURIComponent(identifier)}${replaceParam}`,
      data: bundle,
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new PkiSyncError({ message: parsed.error || "Failed to import certificate to Kemp LoadMaster" });
    }
  };

  const listIntermediateIdentifiers = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<Set<string>> => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/listintermediate`,
      headers,
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) return new Set<string>();

    return extractCertNames(parsed.data);
  };

  const addIntermediateCertificate = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    identifier: string,
    certPem: string
  ): Promise<void> => {
    const payload = await makeRequest<string>({
      method: "POST",
      url: `${baseUrl}/access/addintermediate?cert=${encodeURIComponent(identifier)}`,
      data: certPem,
      headers: { ...headers, "Content-Type": "application/octet-stream" },
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    // The LoadMaster refuses to overwrite an existing intermediate ("already exists")
    if (!parsed.ok && !(parsed.error ?? "").toLowerCase().includes("exists")) {
      throw new PkiSyncError({ message: parsed.error || "Failed to import intermediate certificate" });
    }
  };

  const deleteCertificate = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    identifier: string
  ): Promise<void> => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/delcert?cert=${encodeURIComponent(identifier)}`,
      headers,
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new PkiSyncError({ message: parsed.error || "Failed to delete certificate from Kemp LoadMaster" });
    }
  };

  const getVirtualServiceCertFiles = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    virtualServiceId: string
  ): Promise<string[]> => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/showvs?vs=${encodeURIComponent(virtualServiceId)}`,
      headers,
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new PkiSyncError({
        message: `Failed to read Virtual Service ${virtualServiceId} on Kemp LoadMaster: ${parsed.error || "unexpected response"}`
      });
    }

    const certFile = (parsed.data as { CertFile?: unknown } | undefined)?.CertFile;
    if (certFile === undefined || certFile === null || certFile === "") {
      return [];
    }
    return String(certFile)
      .split(WHITESPACE_SPLIT)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const setVirtualServiceCertFiles = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    virtualServiceId: string,
    certFiles: string[]
  ): Promise<void> => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/modvs?vs=${encodeURIComponent(virtualServiceId)}&certfile=${encodeURIComponent(
        certFiles.join(" ")
      )}`,
      headers,
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new PkiSyncError({
        message: `Failed to bind certificates to Virtual Service ${virtualServiceId}: ${parsed.error || "unexpected response"}`
      });
    }
  };

  const reconcileVirtualServiceBinding = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    virtualServiceId: string,
    activeIdentifiers: Set<string>,
    managedIdentifiers: Set<string>,
    canRemoveCertificates: boolean,
    storedCertNames: Set<string>
  ): Promise<void> => {
    const current = await getVirtualServiceCertFiles(makeRequest, baseUrl, headers, virtualServiceId);

    // A Virtual Service with SSL turned on but no real certificate shows a temporary self-signed
    // placeholder that is not a stored certificate. Sending that placeholder back would make the
    // LoadMaster reject the whole update, so we keep only certificates that exist in the store.
    const preserved = current.filter(
      (entry) => storedCertNames.has(entry) && (!canRemoveCertificates || !managedIdentifiers.has(entry))
    );

    const desired: string[] = [];
    const seen = new Set<string>();
    for (const entry of [...preserved, ...activeIdentifiers]) {
      if (!seen.has(entry)) {
        seen.add(entry);
        desired.push(entry);
      }
    }

    const unchanged = desired.length === current.length && desired.every((entry, idx) => entry === current[idx]);
    if (unchanged) {
      return;
    }

    await setVirtualServiceCertFiles(makeRequest, baseUrl, headers, virtualServiceId, desired);
  };

  type TPreparedCertificate = {
    targetIdentifier: string;
    cert: string;
    privateKey: string;
    certificateChain?: string;
    certificateId?: string;
    isUpdate: boolean;
    oldCertificateIdToRemove?: string;
  };

  // Resolves the target identifier for each certificate (handling renewal reuse/rename) and filters out
  // certificates that cannot be synced (missing data, superseded by a renewal).
  const prepareCertificatesForUpload = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap,
    existingCertNames: Set<string>,
    syncRecordsByCertId: Map<string, TCertificateSyncs>,
    options: { preserveItemOnRenewal: boolean; certificateNameSchema?: string }
  ): Promise<{
    certificatesToUpload: TPreparedCertificate[];
    skippedCertificates: Array<{ name: string; reason: string }>;
  }> => {
    const { preserveItemOnRenewal, certificateNameSchema } = options;
    const certificatesToUpload: TPreparedCertificate[] = [];
    const skippedCertificates: Array<{ name: string; reason: string }> = [];

    for (const [certName, certData] of Object.entries(certificateMap)) {
      const { cert, privateKey, certificateChain, certificateId } = certData;

      if (!cert || !privateKey) {
        skippedCertificates.push({ name: certName, reason: "Missing certificate or private key data" });
        // eslint-disable-next-line no-continue
        continue;
      }

      let certificate: Awaited<ReturnType<typeof certificateDAL.findById>> | undefined;
      if (typeof certificateId === "string") {
        certificate = await certificateDAL.findById(certificateId);
        if (certificate?.renewedByCertificateId) {
          skippedCertificates.push({
            name: certName,
            reason: "Certificate has been renewed and replaced by a newer certificate"
          });
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      let targetIdentifier = certName;
      let isUpdate = false;
      let oldCertificateIdToRemove: string | undefined;

      if (typeof certificateId === "string") {
        const syncRecordLookupId = certificate?.renewedFromCertificateId || certificateId;
        const existingSyncRecord = syncRecordsByCertId.get(syncRecordLookupId);

        if (certificate?.renewedFromCertificateId && preserveItemOnRenewal && existingSyncRecord?.externalIdentifier) {
          targetIdentifier = existingSyncRecord.externalIdentifier;
          isUpdate = true;
          oldCertificateIdToRemove = certificate.renewedFromCertificateId;
        } else if (certificate?.renewedFromCertificateId && !preserveItemOnRenewal) {
          if (certificateNameSchema) {
            targetIdentifier = compileCertificateNameSchema(
              certificateNameSchema,
              {
                certificateId,
                profileId: certData.profileId,
                applicationId: pkiSync.applicationId,
                applicationName: pkiSync.applicationName,
                commonName: certData.commonName
              },
              PkiSync.KempLoadMaster
            );
          } else {
            targetIdentifier = `Infisical-${certificateId.replace(DASH_GLOBAL, "")}`;
          }
        } else {
          const directSyncRecord = syncRecordsByCertId.get(certificateId);
          if (directSyncRecord?.externalIdentifier && existingCertNames.has(directSyncRecord.externalIdentifier)) {
            targetIdentifier = directSyncRecord.externalIdentifier;
            isUpdate = true;
          }
        }
      }

      certificatesToUpload.push({
        targetIdentifier,
        cert,
        privateKey,
        certificateChain,
        certificateId,
        isUpdate,
        oldCertificateIdToRemove
      });
    }

    return { certificatesToUpload, skippedCertificates };
  };

  // Uploads chain/CA certificates (when enabled) and the leaf certificate bundles to the LoadMaster,
  // recording each result on the certificate-sync row.
  const syncCertificatesToLoadMaster = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    pkiSync: TPkiSyncWithCredentials,
    hostname: string,
    certificatesToUpload: TPreparedCertificate[],
    existingCertNames: Set<string>,
    activeIdentifiers: Set<string>,
    managedIdentifiers: Set<string>,
    options: { caCertificateNameSchema: string }
  ): Promise<{ uploaded: number; failedUploads: Array<{ name: string; error: string }> }> => {
    const { caCertificateNameSchema } = options;
    let uploaded = 0;
    const failedUploads: Array<{ name: string; error: string }> = [];
    const failedIntermediateIds = new Set<string>();

    // Push each chain/CA cert into the LoadMaster's dedicated intermediate store
    const existingIntermediateNames = await listIntermediateIdentifiers(makeRequest, baseUrl, headers);
    const processedIntermediates = new Set<string>();
    for (const { certificateChain } of certificatesToUpload) {
      for (const intermediatePem of splitPemChain(certificateChain ?? "")) {
        const intermediateId = buildIntermediateIdentifier(intermediatePem, caCertificateNameSchema);
        if (processedIntermediates.has(intermediateId) || existingIntermediateNames.has(intermediateId)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        processedIntermediates.add(intermediateId);
        try {
          await addIntermediateCertificate(makeRequest, baseUrl, headers, intermediateId, intermediatePem);
          existingIntermediateNames.add(intermediateId);
          logger.info(
            `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: ensured intermediate "${intermediateId}" on ${hostname}`
          );
        } catch (error: unknown) {
          failedIntermediateIds.add(intermediateId);
          logger.error(
            { error },
            `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: failed to import intermediate "${intermediateId}"`
          );
        }
      }
    }

    for (const {
      targetIdentifier,
      cert,
      privateKey,
      certificateChain,
      certificateId,
      isUpdate,
      oldCertificateIdToRemove
    } of certificatesToUpload) {
      try {
        const bundle = buildCertificateBundle(cert, privateKey, certificateChain);
        await upsertCertificate(
          makeRequest,
          baseUrl,
          headers,
          targetIdentifier,
          bundle,
          existingCertNames.has(targetIdentifier)
        );

        existingCertNames.add(targetIdentifier);
        activeIdentifiers.add(targetIdentifier);
        managedIdentifiers.add(targetIdentifier);

        const failedChainCaNames = failedIntermediateIds.size
          ? splitPemChain(certificateChain ?? "")
              .map((pem) => buildIntermediateIdentifier(pem, caCertificateNameSchema))
              .filter((id) => failedIntermediateIds.has(id))
          : [];
        const caWarning = failedChainCaNames.length
          ? ` (warning: could not push CA certificate(s) to the intermediate store: ${failedChainCaNames.join(", ")})`
          : "";

        if (certificateId) {
          const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);

          if (existingCertSync) {
            await certificateSyncDAL.updateById(existingCertSync.id, {
              externalIdentifier: targetIdentifier,
              syncStatus: CertificateSyncStatus.Succeeded,
              lastSyncMessage: `${
                isUpdate
                  ? `Updated certificate on Kemp LoadMaster as "${targetIdentifier}"`
                  : `Synced certificate to Kemp LoadMaster as "${targetIdentifier}"`
              }${caWarning}`,
              lastSyncedAt: new Date()
            });
          } else {
            await certificateSyncDAL.addCertificates(pkiSync.id, [
              { certificateId, externalIdentifier: targetIdentifier }
            ]);
          }

          if (oldCertificateIdToRemove) {
            await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateIdToRemove]);
          }
        }

        uploaded += 1;

        logger.info(
          `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: ${isUpdate ? "updated" : "uploaded"} certificate "${targetIdentifier}" on ${hostname}`
        );
      } catch (error: unknown) {
        const errorMessage = kempError(error, "Unknown error");
        failedUploads.push({ name: targetIdentifier, error: errorMessage });

        if (certificateId) {
          const syncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
          if (syncRecord) {
            await certificateSyncDAL.updateById(syncRecord.id, {
              syncStatus: CertificateSyncStatus.Failed,
              lastSyncMessage: `Failed to sync to Kemp LoadMaster: ${errorMessage}`.slice(0, 4096)
            });
          }
        }

        logger.error(
          { error },
          `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: failed to upload certificate "${targetIdentifier}"`
        );
      }
    }

    return { uploaded, failedUploads };
  };

  // Removes certificates that are no longer managed by this sync (unbinding them from the Virtual
  // Service first, since the LoadMaster refuses to delete a bound certificate).
  const cleanupOrphanedCertificates = async (
    makeRequest: TKempRequestFn,
    baseUrl: string,
    headers: Record<string, string>,
    pkiSync: TPkiSyncWithCredentials,
    hostname: string,
    context: {
      certificateMap: TCertificateMap;
      certificatesToUpload: TPreparedCertificate[];
      existingSyncRecords: TCertificateSyncs[];
      existingCertNames: Set<string>;
      activeIdentifiers: Set<string>;
      managedIdentifiers: Set<string>;
      virtualServiceId?: string;
    },
    options: { canRemoveCertificates: boolean; certificateNameSchema?: string }
  ): Promise<{ removed: number; failedRemovals: Array<{ name: string; error: string }> }> => {
    const { canRemoveCertificates, certificateNameSchema } = options;
    const {
      certificateMap,
      certificatesToUpload,
      existingSyncRecords,
      existingCertNames,
      activeIdentifiers,
      managedIdentifiers,
      virtualServiceId
    } = context;
    let removed = 0;
    const failedRemovals: Array<{ name: string; error: string }> = [];

    // Certificates this sync still manages, so a cert whose upload failed this run is not mistaken
    // for an orphan and deleted.
    const managedCertificateIds = new Set<string>();
    for (const certData of Object.values(certificateMap)) {
      if (certData.certificateId) managedCertificateIds.add(certData.certificateId);
    }
    const attemptedIdentifiers = new Set(certificatesToUpload.map((entry) => entry.targetIdentifier));

    const identifiersToRemove = new Set<string>();
    if (canRemoveCertificates) {
      for (const syncRecord of existingSyncRecords) {
        if (
          syncRecord.externalIdentifier &&
          !activeIdentifiers.has(syncRecord.externalIdentifier) &&
          existingCertNames.has(syncRecord.externalIdentifier) &&
          !(syncRecord.certificateId && managedCertificateIds.has(syncRecord.certificateId))
        ) {
          identifiersToRemove.add(syncRecord.externalIdentifier);
        }
      }

      // Catch certificates whose sync records were lost, by name pattern. Skip anything attempted
      // this run so a failed upload is not treated as an orphan.
      if (!certificateNameSchemaHasFreeTextPlaceholder(certificateNameSchema)) {
        const managedCertNamePattern = buildManagedCertNamePattern(certificateNameSchema);
        for (const certName of existingCertNames) {
          if (
            managedCertNamePattern.test(certName) &&
            !activeIdentifiers.has(certName) &&
            !attemptedIdentifiers.has(certName)
          ) {
            identifiersToRemove.add(certName);
          }
        }
      }

      identifiersToRemove.forEach((identifier) => managedIdentifiers.add(identifier));
    }

    // Reconcile the Virtual Service binding BEFORE deleting: the LoadMaster refuses to delete a
    // certificate that is still bound, so removed certificates must be unbound here first.
    let virtualServiceBindingError: string | undefined;
    if (virtualServiceId) {
      try {
        await reconcileVirtualServiceBinding(
          makeRequest,
          baseUrl,
          headers,
          virtualServiceId,
          activeIdentifiers,
          managedIdentifiers,
          canRemoveCertificates,
          existingCertNames
        );
      } catch (error: unknown) {
        virtualServiceBindingError = kempError(error, "Failed to bind certificates to the Virtual Service");
        logger.error(
          { error },
          `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: failed to bind certificates to Virtual Service ${virtualServiceId}`
        );
      }
    }

    for (const identifier of identifiersToRemove) {
      try {
        await deleteCertificate(makeRequest, baseUrl, headers, identifier);
        removed += 1;

        logger.info(
          `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: removed orphaned certificate "${identifier}" from ${hostname}`
        );
      } catch (error: unknown) {
        failedRemovals.push({ name: identifier, error: kempError(error, "Unknown error") });
        logger.error(
          { error },
          `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: failed to remove certificate "${identifier}"`
        );
      }
    }

    // Leaves are already uploaded, so a binding failure can't block them; but it must surface as a
    // failed sync
    if (virtualServiceBindingError) {
      throw new PkiSyncError({
        message: `Failed to bind certificates to Virtual Service ${virtualServiceId}: ${virtualServiceBindingError}`,
        shouldRetry: false
      });
    }

    return { removed, failedRemovals };
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<{
    uploaded: number;
    removed?: number;
    failedRemovals?: number;
    skipped: number;
    details?: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    };
  }> => {
    const credentials = getKempCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TKempLoadMasterPkiSyncConfig;
    const syncOptions = pkiSync.syncOptions as
      | {
          certificateNameSchema?: string;
          canRemoveCertificates?: boolean;
          preserveItemOnRenewal?: boolean;
          caCertificateNameSchema?: string;
        }
      | undefined;
    const caCertificateNameSchema = syncOptions?.caCertificateNameSchema || KEMP_LOADMASTER_DEFAULT_CA_NAME_SCHEMA;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const preserveItemOnRenewal = syncOptions?.preserveItemOnRenewal ?? true;
    const certificateNameSchema = syncOptions?.certificateNameSchema;
    const { virtualServiceId } = config;

    const baseUrl = getKempBaseUrl(credentials);
    const headers = getKempAuthHeaders(credentials);
    const effectiveGatewayId = await resolveGateway(pkiSync);

    return executeKempLoadMasterOperationWithGateway(
      { gatewayId: effectiveGatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        const existingCertNames = await listCertificateIdentifiers(makeRequest, baseUrl, headers);
        const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);

        const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
        const managedIdentifiers = new Set<string>();
        existingSyncRecords.forEach((record: TCertificateSyncs) => {
          if (record.certificateId) syncRecordsByCertId.set(record.certificateId, record);
          if (record.externalIdentifier) managedIdentifiers.add(record.externalIdentifier);
        });
        const activeIdentifiers = new Set<string>();

        const { certificatesToUpload, skippedCertificates } = await prepareCertificatesForUpload(
          pkiSync,
          certificateMap,
          existingCertNames,
          syncRecordsByCertId,
          { preserveItemOnRenewal, certificateNameSchema }
        );

        const { uploaded, failedUploads } = await syncCertificatesToLoadMaster(
          makeRequest,
          baseUrl,
          headers,
          pkiSync,
          credentials.hostname,
          certificatesToUpload,
          existingCertNames,
          activeIdentifiers,
          managedIdentifiers,
          { caCertificateNameSchema }
        );

        const { removed, failedRemovals } = await cleanupOrphanedCertificates(
          makeRequest,
          baseUrl,
          headers,
          pkiSync,
          credentials.hostname,
          {
            certificateMap,
            certificatesToUpload,
            existingSyncRecords,
            existingCertNames,
            activeIdentifiers,
            managedIdentifiers,
            virtualServiceId
          },
          { canRemoveCertificates, certificateNameSchema }
        );

        return {
          uploaded,
          removed: removed > 0 ? removed : undefined,
          failedRemovals: failedRemovals.length > 0 ? failedRemovals.length : undefined,
          skipped: skippedCertificates.length,
          details: {
            failedUploads: failedUploads.length > 0 ? failedUploads : undefined,
            failedRemovals: failedRemovals.length > 0 ? failedRemovals : undefined,
            skippedCertificates: skippedCertificates.length > 0 ? skippedCertificates : undefined
          }
        };
      }
    );
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: {
      certificateSyncDAL?: Pick<TCertificateSyncDALFactory, "findByPkiSyncId">;
      certificateMap?: TCertificateMap;
    }
  ): Promise<void> => {
    if (certificateNames.length === 0) return;

    const credentials = getKempCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TKempLoadMasterPkiSyncConfig;
    const { virtualServiceId } = config;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const identifiersToRemove: string[] = [];
    const certificateIdsToClean: string[] = [];

    for (const certName of certificateNames) {
      const certificateId = deps?.certificateMap?.[certName]?.certificateId;
      if (certificateId) {
        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);
        if (syncRecord?.externalIdentifier) {
          identifiersToRemove.push(syncRecord.externalIdentifier);
          certificateIdsToClean.push(certificateId);
        }
      }
    }

    if (identifiersToRemove.length === 0) {
      return;
    }

    const baseUrl = getKempBaseUrl(credentials);
    const headers = getKempAuthHeaders(credentials);
    const effectiveGatewayId = await resolveGateway(pkiSync);

    await executeKempLoadMasterOperationWithGateway(
      { gatewayId: effectiveGatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        if (virtualServiceId) {
          try {
            const current = await getVirtualServiceCertFiles(makeRequest, baseUrl, headers, virtualServiceId);
            const removalSet = new Set(identifiersToRemove);
            const desired = current.filter((entry) => !removalSet.has(entry));
            if (desired.length !== current.length) {
              await setVirtualServiceCertFiles(makeRequest, baseUrl, headers, virtualServiceId, desired);
            }
          } catch (error: unknown) {
            logger.error(
              { error },
              `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: failed to unbind certificates from Virtual Service ${virtualServiceId}`
            );
          }
        }

        for (const identifier of identifiersToRemove) {
          try {
            await deleteCertificate(makeRequest, baseUrl, headers, identifier);
            logger.info(
              `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: removed certificate "${identifier}" from ${credentials.hostname}`
            );
          } catch (error: unknown) {
            const message = kempError(error, "Unknown error");
            if (message.toLowerCase().includes("has been deleted") || message.toLowerCase().includes("not found")) {
              logger.info(
                `Kemp LoadMaster PKI sync [syncId=${pkiSync.id}]: certificate "${identifier}" already removed from ${credentials.hostname}`
              );
              // eslint-disable-next-line no-continue
              continue;
            }
            throw new PkiSyncError({
              message: `Failed to remove certificate "${identifier}" from Kemp LoadMaster: ${message}`,
              shouldRetry: true
            });
          }
        }
      }
    );

    if (certificateIdsToClean.length > 0) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToClean);
    }
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
