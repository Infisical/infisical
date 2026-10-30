/* eslint-disable no-await-in-loop */
import { TCertificateSyncs } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import {
  extractImpervaErrorMessage,
  getImpervaAccountParams,
  IMPERVA_CERTIFICATES_BASE_PATH,
  IMPERVA_PROV_BASE_PATH,
  IMPERVA_PROV_HOST,
  IMPERVA_REST_HOST,
  ImpervaRequestError,
  TImpervaRequestFn,
  withImpervaOperation
} from "@app/services/app-connection/imperva/imperva-connection-fns";
import { TImpervaConnection } from "@app/services/app-connection/imperva/imperva-connection-types";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { splitPemChain } from "@app/services/certificate/certificate-fns";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { resolveEffectiveSyncGatewayId } from "../pki-sync-gateway-fns";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { ImpervaCertificateAuthType } from "./imperva-pki-sync-constants";
import { TImpervaPkiSyncConfig } from "./imperva-pki-sync-types";

type TImpervaCredentials = TImpervaConnection["credentials"];

type TImpervaPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
    | "findExternalIdentifiersInUse"
    | "claimExternalIdentifier"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TImpervaSiteCertificate = {
  authType?: string;
  customCertificateDetails?: { hasMismatchSite?: boolean };
};

const IMPERVA_CUSTOM_CERT_TYPE = "CUSTOM_CERT";

// Imperva answers a rejected upload with a bare "Invalid input", which tells the user nothing about
// what to change, so the conditions it enforces are spelled out alongside its message.
const IMPERVA_UPLOAD_REJECTION_HINT =
  "Imperva rejected the certificate. It has to cover at least one domain the website serves, and its key has to be RSA under 4096 bits or ECDSA P-256";

// 429 aside, a 4xx is Imperva refusing the request itself, so repeating it changes nothing.
export const isImpervaRetryable = (error: unknown): boolean => {
  if (!(error instanceof ImpervaRequestError) || error.status === undefined) return true;
  return error.status === 429 || error.status < 400 || error.status >= 500;
};

export const describeImpervaUploadFailure = (error: unknown): string => {
  const message = extractImpervaErrorMessage(error, "Unknown error");
  const status = error instanceof ImpervaRequestError ? error.status : undefined;
  return status === 400 ? `${message}. ${IMPERVA_UPLOAD_REJECTION_HINT}` : message;
};

const getImpervaCredentials = (pkiSync: TPkiSyncWithCredentials): TImpervaCredentials => {
  const credentials = pkiSync.connection.credentials as TImpervaCredentials;
  if (!credentials?.apiId || !credentials?.apiKey) {
    throw new PkiSyncError({
      message: "Imperva credentials (API ID, API key) not found in connection credentials"
    });
  }
  return credentials;
};

// Imperva keeps one custom certificate per site for each key type, so the key type is part of the
// slot a certificate occupies and is required to remove it again.
export const resolveImpervaAuthType = (certPem: string): ImpervaCertificateAuthType | undefined => {
  try {
    const keyType = crypto.nativeCrypto.createPublicKey(certPem).asymmetricKeyType;
    if (keyType === "ec") return ImpervaCertificateAuthType.Ecc;
    if (keyType === "rsa" || keyType === "rsa-pss") return ImpervaCertificateAuthType.Rsa;
    return undefined;
  } catch {
    return undefined;
  }
};

export const describeImpervaKeyType = (certPem: string): string => {
  try {
    return crypto.nativeCrypto.createPublicKey(certPem).asymmetricKeyType ?? "an unrecognized key type";
  } catch {
    return "an unreadable public key";
  }
};

export const buildImpervaExternalIdentifier = (siteId: string, authType: ImpervaCertificateAuthType): string =>
  `${siteId}:${authType}`;

export const parseImpervaExternalIdentifier = (
  externalIdentifier: string
): { siteId: string; authType: ImpervaCertificateAuthType } => {
  const [siteId, authType] = externalIdentifier.split(":");
  return {
    siteId,
    authType:
      authType === ImpervaCertificateAuthType.Ecc ? ImpervaCertificateAuthType.Ecc : ImpervaCertificateAuthType.Rsa
  };
};

export const buildImpervaCertificatePayload = (cert: string, certificateChain?: string): string => {
  const chain = splitPemChain(certificateChain ?? "");
  return Buffer.from([cert.trim(), ...chain].join("\n")).toString("base64");
};

export const impervaPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service,
  gatewayPoolService
}: TImpervaPkiSyncFactoryDeps) => {
  const uploadCustomCertificate = async (
    makeRequest: TImpervaRequestFn,
    credentials: TImpervaCredentials,
    siteId: string,
    payload: { certificate: string; privateKey: string; authType: ImpervaCertificateAuthType }
  ): Promise<void> => {
    await makeRequest({
      method: "PUT",
      host: IMPERVA_PROV_HOST,
      path: `${IMPERVA_PROV_BASE_PATH}/sites/${encodeURIComponent(siteId)}/customCertificate`,
      params: getImpervaAccountParams(credentials),
      headers: { "Content-Type": "application/json" },
      data: {
        certificate: payload.certificate,
        private_key: payload.privateKey,
        auth_type: payload.authType
      }
    });
  };

  const deleteCustomCertificate = async (
    makeRequest: TImpervaRequestFn,
    credentials: TImpervaCredentials,
    siteId: string,
    authType: ImpervaCertificateAuthType
  ): Promise<void> => {
    await makeRequest({
      method: "DELETE",
      host: IMPERVA_PROV_HOST,
      path: `${IMPERVA_PROV_BASE_PATH}/sites/${encodeURIComponent(siteId)}/customCertificate`,
      params: { auth_type: authType, ...getImpervaAccountParams(credentials) }
    });
  };

  const getSiteCustomCertificates = async (
    makeRequest: TImpervaRequestFn,
    credentials: TImpervaCredentials,
    siteId: string
  ): Promise<TImpervaSiteCertificate[]> => {
    const response = await makeRequest<{ data?: TImpervaSiteCertificate[] }>({
      method: "GET",
      host: IMPERVA_REST_HOST,
      path: `${IMPERVA_CERTIFICATES_BASE_PATH}/certificates`,
      params: {
        extSiteId: siteId,
        certType: IMPERVA_CUSTOM_CERT_TYPE,
        ...getImpervaAccountParams(credentials)
      }
    });

    return response.data ?? [];
  };

  // A certificate covering some but not all of the site's managed domains is deployed and flagged
  // rather than refused, and Imperva keeps serving the previous one, so the flag has to reach the sync.
  const buildDeploymentWarning = async (
    makeRequest: TImpervaRequestFn,
    credentials: TImpervaCredentials,
    siteId: string,
    authType: ImpervaCertificateAuthType
  ): Promise<string> => {
    try {
      const certificates = await getSiteCustomCertificates(makeRequest, credentials, siteId);
      const deployed = certificates.find((entry) => entry.authType === authType);

      if (!deployed) return "";
      if (deployed.customCertificateDetails?.hasMismatchSite) {
        return "Imperva reports the certificate does not cover every managed domain on the site, so it keeps serving the previous certificate";
      }
      return "";
    } catch (error: unknown) {
      logger.warn(
        { error },
        `Imperva PKI sync: unable to read certificate state for site ${siteId} after upload, continuing`
      );
      return "";
    }
  };

  type TPreparedCertificate = {
    certName: string;
    cert: string;
    privateKey: string;
    certificateChain?: string;
    certificateId?: string;
    renewedFromCertificateId?: string | null;
    authType: ImpervaCertificateAuthType;
  };

  const prepareCertificate = async (
    certificateMap: TCertificateMap
  ): Promise<{
    certificate?: TPreparedCertificate;
    skippedCertificates: Array<{ name: string; reason: string }>;
  }> => {
    const skippedCertificates: Array<{ name: string; reason: string }> = [];
    let selected: TPreparedCertificate | undefined;

    const entries = Object.entries(certificateMap).sort(([a], [b]) => a.localeCompare(b));

    for (const [certName, certData] of entries) {
      const { cert, privateKey, certificateChain, certificateId } = certData;

      if (!cert || !privateKey) {
        skippedCertificates.push({ name: certName, reason: "Missing certificate or private key data" });
        // eslint-disable-next-line no-continue
        continue;
      }

      const authType = resolveImpervaAuthType(cert);
      if (!authType) {
        skippedCertificates.push({
          name: certName,
          reason: `Imperva accepts only RSA and ECDSA certificates, and this one uses ${describeImpervaKeyType(cert)}`
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (selected) {
        skippedCertificates.push({
          name: certName,
          reason: "Imperva holds a single custom certificate per site"
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      let renewedFromCertificateId: string | null | undefined;
      if (typeof certificateId === "string") {
        const certificate = await certificateDAL.findById(certificateId);
        if (certificate?.renewedByCertificateId) {
          skippedCertificates.push({
            name: certName,
            reason: "Certificate has been renewed and replaced by a newer certificate"
          });
          // eslint-disable-next-line no-continue
          continue;
        }
        renewedFromCertificateId = certificate?.renewedFromCertificateId;
      }

      selected = { certName, cert, privateKey, certificateChain, certificateId, renewedFromCertificateId, authType };
    }

    return { certificate: selected, skippedCertificates };
  };

  // Clears the slots this run did not write to, on whichever website each one belongs to.
  const removeOrphanedSlots = async (args: {
    pkiSync: TPkiSyncWithCredentials;
    makeRequest: TImpervaRequestFn;
    credentials: TImpervaCredentials;
    siteId: string;
    siteLabel: string;
    existingSyncRecords: TCertificateSyncs[];
    occupiedSlots: Set<string>;
    activeCertificateIds: Set<string>;
  }): Promise<{ removed: number; failedRemovals: Array<{ name: string; error: string }> }> => {
    const { pkiSync, makeRequest, credentials, siteId, siteLabel, existingSyncRecords } = args;
    const { occupiedSlots, activeCertificateIds } = args;
    const failedRemovals: Array<{ name: string; error: string }> = [];
    let removed = 0;

    // Keyed on the slot rather than the certificate, so repointing the sync to another website
    // still clears the slot the certificate used to occupy on the old one.
    const orphanedRecords = existingSyncRecords.filter(
      (record: TCertificateSyncs) => record.externalIdentifier && !occupiedSlots.has(record.externalIdentifier)
    );

    const ownedByOtherSync = await certificateSyncDAL.findExternalIdentifiersInUse(
      orphanedRecords.map((record: TCertificateSyncs) => record.externalIdentifier as string),
      { excludePkiSyncId: pkiSync.id, destination: pkiSync.destination }
    );

    for (const record of orphanedRecords) {
      if (ownedByOtherSync.has(record.externalIdentifier as string)) {
        if (record.certificateId && !activeCertificateIds.has(record.certificateId)) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, [record.certificateId]);
        }
        // eslint-disable-next-line no-continue
        continue;
      }

      // The slot a record occupies belongs to the site it was uploaded to, which is not the sync's
      // current site once the destination has been repointed.
      const { siteId: recordSiteId, authType } = parseImpervaExternalIdentifier(record.externalIdentifier as string);
      const recordSiteLabel = recordSiteId === siteId ? siteLabel : recordSiteId;

      try {
        await deleteCustomCertificate(makeRequest, credentials, recordSiteId, authType);
        removed += 1;

        // The row survives when the same certificate was just written to a different slot, since
        // it now points at that new slot.
        if (record.certificateId && !activeCertificateIds.has(record.certificateId)) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, [record.certificateId]);
        }

        logger.info(
          `Imperva PKI sync [syncId=${pkiSync.id}]: removed orphaned ${authType} custom certificate from site ${recordSiteLabel}`
        );
      } catch (error: unknown) {
        failedRemovals.push({
          name: record.externalIdentifier as string,
          error: extractImpervaErrorMessage(error, "Unknown error")
        });
        logger.error(
          { error },
          `Imperva PKI sync [syncId=${pkiSync.id}]: failed to remove ${authType} custom certificate from site ${recordSiteLabel}`
        );
      }
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
    partialFailureMessage?: string;
    details?: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    };
  }> => {
    const credentials = getImpervaCredentials(pkiSync);
    const { siteId, siteName } = pkiSync.destinationConfig as TImpervaPkiSyncConfig;
    const syncOptions = pkiSync.syncOptions as { canRemoveCertificates?: boolean } | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const siteLabel = siteName ? `${siteName} (${siteId})` : siteId;

    const effectiveGatewayId = await resolveEffectiveSyncGatewayId(pkiSync, gatewayPoolService);

    return withImpervaOperation(
      { gatewayId: effectiveGatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
        const { certificate, skippedCertificates } = await prepareCertificate(certificateMap);

        const failedUploads: Array<{ name: string; error: string }> = [];
        // Uploaded but not served. Reported per certificate so its row does not read Succeeded.
        const undeployedCertificates: Array<{ name: string; error: string }> = [];
        let uploadRetryable = true;
        const failedRemovals: Array<{ name: string; error: string }> = [];
        const occupiedSlots = new Set<string>();
        let deploymentWarning = "";
        const activeCertificateIds = new Set<string>();
        let uploaded = 0;
        let removed = 0;

        const renewedFromCertificateIds: string[] = [];

        if (certificate) {
          const { authType } = certificate;
          const externalIdentifier = buildImpervaExternalIdentifier(siteId, authType);

          // Claimed up front so the slot is never held by a live certificate no record points at,
          // and released below when Imperva answers that it wrote nothing.
          const claimedRecord = certificate.certificateId
            ? existingSyncRecords.find(
                (record: TCertificateSyncs) => record.certificateId === certificate.certificateId
              )
            : undefined;

          if (certificate.certificateId) {
            await certificateSyncDAL.claimExternalIdentifier(pkiSync.id, certificate.certificateId, externalIdentifier);
          }

          try {
            await uploadCustomCertificate(makeRequest, credentials, siteId, {
              certificate: buildImpervaCertificatePayload(certificate.cert, certificate.certificateChain),
              privateKey: Buffer.from(certificate.privateKey.trim()).toString("base64"),
              authType
            });

            occupiedSlots.add(externalIdentifier);
            uploaded += 1;

            deploymentWarning = await buildDeploymentWarning(makeRequest, credentials, siteId, authType);
            if (deploymentWarning) {
              undeployedCertificates.push({ name: certificate.certName, error: deploymentWarning });
            }

            if (certificate.certificateId) {
              activeCertificateIds.add(certificate.certificateId);

              const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(
                pkiSync.id,
                certificate.certificateId
              );

              if (existingCertSync) {
                await certificateSyncDAL.updateById(existingCertSync.id, {
                  externalIdentifier,
                  syncStatus: deploymentWarning ? CertificateSyncStatus.Failed : CertificateSyncStatus.Succeeded,
                  lastSyncMessage:
                    deploymentWarning || `Synced ${authType} custom certificate to Imperva site ${siteLabel}`,
                  lastSyncedAt: new Date()
                });
              } else {
                await certificateSyncDAL.addCertificates(pkiSync.id, [
                  { certificateId: certificate.certificateId, externalIdentifier }
                ]);
              }

              // Dropped after the cleanup below, which still needs the record to find the old slot.
              if (certificate.renewedFromCertificateId) {
                renewedFromCertificateIds.push(certificate.renewedFromCertificateId);
              }
            }

            logger.info(
              `Imperva PKI sync [syncId=${pkiSync.id}]: uploaded ${authType} custom certificate to site ${siteLabel}`
            );
          } catch (error: unknown) {
            // Imperva answering a refusal means nothing was written, so the claim has to go back to
            // whatever it said before. A timeout says nothing either way, so the claim stands.
            if (certificate.certificateId && !isImpervaRetryable(error)) {
              if (claimedRecord) {
                await certificateSyncDAL.updateById(claimedRecord.id, {
                  externalIdentifier: claimedRecord.externalIdentifier
                });
              } else {
                await certificateSyncDAL.removeCertificates(pkiSync.id, [certificate.certificateId]);
              }
            }

            const errorMessage = describeImpervaUploadFailure(error);
            uploadRetryable = isImpervaRetryable(error);
            failedUploads.push({ name: certificate.certName, error: errorMessage });

            if (certificate.certificateId) {
              const syncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(
                pkiSync.id,
                certificate.certificateId
              );
              if (syncRecord) {
                await certificateSyncDAL.updateById(syncRecord.id, {
                  syncStatus: CertificateSyncStatus.Failed,
                  lastSyncMessage: `Failed to sync to Imperva: ${errorMessage}`.slice(0, 4096)
                });
              }
            }

            logger.error(
              { error },
              `Imperva PKI sync [syncId=${pkiSync.id}]: failed to upload certificate to site ${siteLabel}`
            );
          }
        }

        // A failed upload, or one Imperva took but will not serve, leaves the previous certificate
        // in place. Clearing its slot would take the website off TLS.
        if (canRemoveCertificates && failedUploads.length === 0 && undeployedCertificates.length === 0) {
          const cleanup = await removeOrphanedSlots({
            pkiSync,
            makeRequest,
            credentials,
            siteId,
            siteLabel,
            existingSyncRecords,
            occupiedSlots,
            activeCertificateIds
          });
          removed = cleanup.removed;
          failedRemovals.push(...cleanup.failedRemovals);
        }

        // Only once the cleanup above has had its look at the old slot.
        if (renewedFromCertificateIds.length > 0 && failedRemovals.length === 0) {
          await certificateSyncDAL.removeCertificates(pkiSync.id, renewedFromCertificateIds);
        }

        if (failedUploads.length > 0) {
          throw new PkiSyncError({
            message: `Failed to sync certificate to Imperva site ${siteLabel}: ${failedUploads[0].error}`,
            shouldRetry: uploadRetryable
          });
        }

        return {
          uploaded,
          removed: removed > 0 ? removed : undefined,
          failedRemovals: failedRemovals.length > 0 ? failedRemovals.length : undefined,
          skipped: skippedCertificates.length,
          partialFailureMessage: deploymentWarning || undefined,
          details: {
            failedUploads: undeployedCertificates.length > 0 ? undeployedCertificates : undefined,
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

    const credentials = getImpervaCredentials(pkiSync);
    const { siteId, siteName } = pkiSync.destinationConfig as TImpervaPkiSyncConfig;
    const siteLabel = siteName ? `${siteName} (${siteId})` : siteId;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    // Keyed by external identifier so a record uploaded to a site the sync no longer points at is
    // still removed from the site that actually holds it.
    const slotsToRemove = new Map<string, string[]>();
    const certificateIdsToClean: string[] = [];

    for (const certName of certificateNames) {
      const certificateId = deps?.certificateMap?.[certName]?.certificateId;
      if (!certificateId) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const syncRecord = existingSyncRecords.find(
        (record: TCertificateSyncs) => record.certificateId === certificateId
      );
      if (!syncRecord) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // A certificate that never reached Imperva has no slot to delete, but its record still has to go
      if (!syncRecord.externalIdentifier) {
        certificateIdsToClean.push(certificateId);
        // eslint-disable-next-line no-continue
        continue;
      }

      slotsToRemove.set(syncRecord.externalIdentifier, [
        ...(slotsToRemove.get(syncRecord.externalIdentifier) ?? []),
        certificateId
      ]);
    }

    if (slotsToRemove.size === 0) {
      if (certificateIdsToClean.length > 0) {
        await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToClean);
      }
      return;
    }

    const ownedByOtherSync = await certificateSyncDAL.findExternalIdentifiersInUse([...slotsToRemove.keys()], {
      excludePkiSyncId: pkiSync.id,
      destination: pkiSync.destination
    });

    for (const [externalIdentifier, certificateIds] of slotsToRemove) {
      if (ownedByOtherSync.has(externalIdentifier)) {
        certificateIdsToClean.push(...certificateIds);
        slotsToRemove.delete(externalIdentifier);
      }
    }

    const effectiveGatewayId = await resolveEffectiveSyncGatewayId(pkiSync, gatewayPoolService);

    try {
      await withImpervaOperation(
        { gatewayId: effectiveGatewayId, credentials },
        gatewayV2Service,
        async (makeRequest) => {
          for (const [externalIdentifier, certificateIds] of slotsToRemove) {
            const { siteId: recordSiteId, authType } = parseImpervaExternalIdentifier(externalIdentifier);
            const recordSiteLabel = recordSiteId === siteId ? siteLabel : recordSiteId;

            try {
              // eslint-disable-next-line no-await-in-loop
              await deleteCustomCertificate(makeRequest, credentials, recordSiteId, authType);
              certificateIdsToClean.push(...certificateIds);

              logger.info(
                `Imperva PKI sync [syncId=${pkiSync.id}]: removed ${authType} custom certificate from site ${recordSiteLabel}`
              );
            } catch (error: unknown) {
              // Deleting an empty slot on a reachable site answers 200, so a 404 means the website
              // is gone or the key lost access, and the certificate may still be installed.
              if (error instanceof ImpervaRequestError && error.status === 404) {
                throw new PkiSyncError({
                  message: `Imperva website ${recordSiteLabel} is unknown to this connection, so its ${authType} custom certificate was left in place. Check that the website still exists and that the API key can reach its account.`,
                  shouldRetry: false
                });
              }

              throw new PkiSyncError({
                message: `Failed to remove ${authType} custom certificate from Imperva site ${recordSiteLabel}: ${extractImpervaErrorMessage(
                  error,
                  "Unknown error"
                )}`,
                shouldRetry: isImpervaRetryable(error)
              });
            }
          }
        }
      );
    } finally {
      // Whatever was cleared before the failure still has to lose its link row, or the sync keeps
      // reporting certificates it has already removed.
      if (certificateIdsToClean.length > 0) {
        await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToClean);
      }
    }
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
