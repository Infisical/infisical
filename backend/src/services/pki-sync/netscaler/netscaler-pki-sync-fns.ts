/* eslint-disable no-await-in-loop */
import { AxiosError, AxiosRequestConfig } from "axios";
import handlebars from "handlebars";
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { executeNetScalerOperationWithGateway } from "@app/services/app-connection/netscaler/netscaler-connection-fns";
import { TNetScalerConnection } from "@app/services/app-connection/netscaler/netscaler-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { TNetScalerPkiSyncConfig } from "./netscaler-pki-sync-types";

type TNetScalerCredentials = TNetScalerConnection["credentials"];

type TRequestFn = <R>(requestCfg: AxiosRequestConfig) => Promise<R>;

type TNetScalerSession = {
  baseUrl: string;
  sessionId: string;
  headers: Record<string, string>;
  makeRequest: TRequestFn;
};

type TNetScalerPkiSyncFactoryDeps = {
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
};

const getNetScalerCredentials = (pkiSync: TPkiSyncWithCredentials): TNetScalerCredentials => {
  const credentials = pkiSync.connection.credentials as TNetScalerCredentials;
  if (!credentials?.hostname || !credentials?.username || !credentials?.password) {
    throw new PkiSyncError({
      message: "NetScaler credentials (hostname, username, password) not found in connection credentials"
    });
  }
  return credentials;
};

const createNetScalerSession = async (
  credentials: TNetScalerCredentials,
  makeRequest: TRequestFn
): Promise<TNetScalerSession> => {
  const { hostname, port, username, password } = credentials;

  const baseUrl = `https://${hostname}:${port ?? 443}/nitro/v1/config`;

  const loginData = await makeRequest<{ sessionid?: string }>({
    method: "POST",
    url: `${baseUrl}/login`,
    data: { login: { username, password } },
    headers: { "Content-Type": "application/json" }
  });

  const sessionId = loginData?.sessionid;
  if (!sessionId) {
    throw new PkiSyncError({
      message: "Failed to login to NetScaler: no session ID returned",
      shouldRetry: true
    });
  }

  return {
    baseUrl,
    sessionId,
    headers: {
      "Content-Type": "application/json",
      Cookie: `NITRO_AUTH_TOKEN=${sessionId}`
    },
    makeRequest
  };
};

const logoutNetScalerSession = async (session: TNetScalerSession): Promise<void> => {
  try {
    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}/logout`,
      data: { logout: {} },
      headers: session.headers
    });
  } catch {
    // Ignore logout errors
  }
};

const saveNetScalerConfig = async (session: TNetScalerSession): Promise<void> => {
  await session.makeRequest({
    method: "POST",
    url: `${session.baseUrl}/nsconfig?action=save`,
    data: { nsconfig: {} },
    headers: session.headers
  });
};

const deleteFile = async (session: TNetScalerSession, filename: string): Promise<void> => {
  try {
    await session.makeRequest({
      method: "DELETE",
      url: `${session.baseUrl}/systemfile/${encodeURIComponent(filename)}?args=filelocation:${encodeURIComponent("/nsconfig/ssl")}`,
      headers: session.headers
    });
  } catch {
    // Ignore errors if file doesn't exist
  }
};

const uploadFileToNetScaler = async (
  session: TNetScalerSession,
  filename: string,
  fileContent: string
): Promise<void> => {
  const contentBase64 = Buffer.from(fileContent).toString("base64");

  try {
    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}/systemfile`,
      data: {
        systemfile: {
          filename,
          filelocation: "/nsconfig/ssl",
          filecontent: contentBase64,
          fileencoding: "BASE64"
        }
      },
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 409) {
      await deleteFile(session, filename);
      await session.makeRequest({
        method: "POST",
        url: `${session.baseUrl}/systemfile`,
        data: {
          systemfile: {
            filename,
            filelocation: "/nsconfig/ssl",
            filecontent: contentBase64,
            fileencoding: "BASE64"
          }
        },
        headers: session.headers
      });
      return;
    }
    throw error;
  }
};

const createOrUpdateCertKey = async (
  session: TNetScalerSession,
  certKeyName: string,
  certFilename: string,
  keyFilename: string
): Promise<void> => {
  try {
    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}/sslcertkey?action=update`,
      data: {
        sslcertkey: {
          certkey: certKeyName,
          cert: `/nsconfig/ssl/${certFilename}`,
          key: `/nsconfig/ssl/${keyFilename}`,
          nodomaincheck: true
        }
      },
      headers: session.headers
    });
  } catch {
    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}/sslcertkey`,
      data: {
        sslcertkey: {
          certkey: certKeyName,
          cert: `/nsconfig/ssl/${certFilename}`,
          key: `/nsconfig/ssl/${keyFilename}`
        }
      },
      headers: session.headers
    });
  }
};

const bindCertKeyToVserver = async (
  session: TNetScalerSession,
  vserverName: string,
  certKeyName: string
): Promise<void> => {
  try {
    await session.makeRequest({
      method: "PUT",
      url: `${session.baseUrl}/sslvserver_sslcertkey_binding`,
      data: {
        sslvserver_sslcertkey_binding: {
          vservername: vserverName,
          certkeyname: certKeyName
        }
      },
      headers: session.headers
    });
  } catch (error: unknown) {
    // 409 = "Resource already exists" - the binding already exists
    if (error instanceof AxiosError && error.response?.status === 409) {
      return;
    }
    throw error;
  }
};

const unbindCertKeyFromVserver = async (
  session: TNetScalerSession,
  vserverName: string,
  certKeyName: string
): Promise<void> => {
  try {
    await session.makeRequest({
      method: "DELETE",
      url: `${session.baseUrl}/sslvserver_sslcertkey_binding/${encodeURIComponent(vserverName)}?args=certkeyname:${encodeURIComponent(certKeyName)}`,
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return;
    }
    throw error;
  }
};

const deleteCertKey = async (session: TNetScalerSession, certKeyName: string): Promise<void> => {
  await session.makeRequest({
    method: "DELETE",
    url: `${session.baseUrl}/sslcertkey/${encodeURIComponent(certKeyName)}`,
    headers: session.headers
  });
};

const listCertKeys = async (session: TNetScalerSession): Promise<Set<string>> => {
  const certKeyNames = new Set<string>();

  try {
    const data = await session.makeRequest<{
      sslcertkey?: Array<{ certkey: string; cert: string; key: string }>;
    }>({
      method: "GET",
      url: `${session.baseUrl}/sslcertkey`,
      headers: session.headers
    });

    if (data?.sslcertkey) {
      for (const ck of data.sslcertkey) {
        certKeyNames.add(ck.certkey);
      }
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return certKeyNames;
    }
    throw error;
  }

  return certKeyNames;
};

const removeNetScalerCertificate = async (
  session: TNetScalerSession,
  certKeyName: string,
  config: TNetScalerPkiSyncConfig
): Promise<void> => {
  if (config.vserverName) {
    await unbindCertKeyFromVserver(session, config.vserverName, certKeyName);
  }

  await deleteCertKey(session, certKeyName);
  await deleteFile(session, `${certKeyName}.cer`);
  await deleteFile(session, `${certKeyName}.key`);
};

export const netScalerPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service
}: TNetScalerPkiSyncFactoryDeps) => {
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
    const credentials = getNetScalerCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TNetScalerPkiSyncConfig;
    const syncOptions = pkiSync.syncOptions as
      | { certificateNameSchema?: string; canRemoveCertificates?: boolean; preserveItemOnRenewal?: boolean }
      | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const preserveItemOnRenewal = syncOptions?.preserveItemOnRenewal ?? true;
    const certificateNameSchema = syncOptions?.certificateNameSchema;

    return executeNetScalerOperationWithGateway(
      { gatewayId: pkiSync.connection.gatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        let uploaded = 0;
        let removed = 0;
        const failedUploads: Array<{ name: string; error: string }> = [];
        const failedRemovals: Array<{ name: string; error: string }> = [];
        const skippedCertificates: Array<{ name: string; reason: string }> = [];

        const session = await createNetScalerSession(credentials, makeRequest);

        try {
          const existingCertKeyNames = await listCertKeys(session);

          const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
          const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
          existingSyncRecords.forEach((record: TCertificateSyncs) => {
            if (record.certificateId) {
              syncRecordsByCertId.set(record.certificateId, record);
            }
          });

          const activeExternalIdentifiers = new Set<string>();

          if (!preserveItemOnRenewal) {
            for (const syncRecord of existingSyncRecords) {
              if (syncRecord.certificateId && syncRecord.externalIdentifier) {
                const cert = await certificateDAL.findById(syncRecord.certificateId);
                if (cert?.renewedByCertificateId && existingCertKeyNames.has(syncRecord.externalIdentifier)) {
                  activeExternalIdentifiers.add(syncRecord.externalIdentifier);
                }
              }
            }
          }

          const certificatesToUpload: Array<{
            targetCertKeyName: string;
            cert: string;
            privateKey: string;
            certificateChain?: string;
            certificateId?: string;
            isUpdate: boolean;
            oldCertificateIdToRemove?: string;
          }> = [];

          for (const [certName, certData] of Object.entries(certificateMap)) {
            const { cert, privateKey, certificateChain, certificateId } = certData;

            if (!cert || !privateKey) {
              skippedCertificates.push({
                name: certName,
                reason: "Missing certificate or private key data"
              });
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

            let targetCertKeyName = certName;
            let isUpdate = false;
            let oldCertificateIdToRemove: string | undefined;

            if (typeof certificateId === "string") {
              const syncRecordLookupId = certificate?.renewedFromCertificateId || certificateId;
              const existingSyncRecord = syncRecordsByCertId.get(syncRecordLookupId);

              if (
                certificate?.renewedFromCertificateId &&
                preserveItemOnRenewal &&
                existingSyncRecord?.externalIdentifier
              ) {
                targetCertKeyName = existingSyncRecord.externalIdentifier;
                isUpdate = true;
                oldCertificateIdToRemove = certificate.renewedFromCertificateId;
                activeExternalIdentifiers.add(targetCertKeyName);
              } else if (certificate?.renewedFromCertificateId && !preserveItemOnRenewal) {
                const certIdClean = certificateId.replace(new RE2("-", "g"), "");
                if (certificateNameSchema) {
                  targetCertKeyName = handlebars.compile(certificateNameSchema)({
                    certificateId: certIdClean,
                    environment: "global"
                  });
                } else {
                  targetCertKeyName = `Infisical-${certIdClean}`;
                }

                if (existingSyncRecord?.externalIdentifier) {
                  activeExternalIdentifiers.add(existingSyncRecord.externalIdentifier);
                }
              } else {
                const directSyncRecord = syncRecordsByCertId.get(certificateId);
                if (
                  directSyncRecord?.externalIdentifier &&
                  existingCertKeyNames.has(directSyncRecord.externalIdentifier)
                ) {
                  targetCertKeyName = directSyncRecord.externalIdentifier;
                  activeExternalIdentifiers.add(targetCertKeyName);
                  isUpdate = true;
                }
              }
            }

            certificatesToUpload.push({
              targetCertKeyName,
              cert,
              privateKey,
              certificateChain,
              certificateId,
              isUpdate,
              oldCertificateIdToRemove
            });
          }

          for (const {
            targetCertKeyName,
            cert,
            privateKey,
            certificateChain,
            certificateId,
            isUpdate,
            oldCertificateIdToRemove
          } of certificatesToUpload) {
            try {
              const certFilename = `${targetCertKeyName}.cer`;
              const keyFilename = `${targetCertKeyName}.key`;

              let fullCertContent = cert;
              if (certificateChain) {
                fullCertContent = `${cert}\n${certificateChain}`;
              }

              await uploadFileToNetScaler(session, certFilename, fullCertContent);
              await uploadFileToNetScaler(session, keyFilename, privateKey);
              await createOrUpdateCertKey(session, targetCertKeyName, certFilename, keyFilename);

              if (config.vserverName) {
                await bindCertKeyToVserver(session, config.vserverName, targetCertKeyName);
              }

              activeExternalIdentifiers.add(targetCertKeyName);

              if (certificateId) {
                const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(
                  pkiSync.id,
                  certificateId
                );

                if (existingCertSync) {
                  await certificateSyncDAL.updateById(existingCertSync.id, {
                    externalIdentifier: targetCertKeyName,
                    syncStatus: CertificateSyncStatus.Succeeded,
                    lastSyncMessage: isUpdate
                      ? `Updated certificate on NetScaler as certkey "${targetCertKeyName}"`
                      : `Synced certificate to NetScaler as certkey "${targetCertKeyName}"`,
                    lastSyncedAt: new Date()
                  });
                } else {
                  await certificateSyncDAL.addCertificates(pkiSync.id, [
                    {
                      certificateId,
                      externalIdentifier: targetCertKeyName
                    }
                  ]);
                }

                if (oldCertificateIdToRemove) {
                  await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateIdToRemove]);
                }
              }

              uploaded += 1;

              logger.info(
                `NetScaler PKI sync [syncId=${pkiSync.id}]: ${isUpdate ? "updated" : "uploaded"} certificate "${targetCertKeyName}" on ${credentials.hostname}`
              );
            } catch (error: unknown) {
              let errorMessage = "Unknown error";
              if (error instanceof AxiosError) {
                errorMessage = String((error.response?.data as { message?: string })?.message || error.message);
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              failedUploads.push({ name: targetCertKeyName, error: errorMessage });

              if (certificateId) {
                const syncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);

                if (syncRecord) {
                  await certificateSyncDAL.updateById(syncRecord.id, {
                    syncStatus: CertificateSyncStatus.Failed,
                    lastSyncMessage: `Failed to sync to NetScaler: ${String(errorMessage)}`.slice(0, 4096)
                  });
                }
              }

              logger.error(
                { error },
                `NetScaler PKI sync [syncId=${pkiSync.id}]: failed to upload certificate "${targetCertKeyName}"`
              );
            }
          }

          if (canRemoveCertificates) {
            const certKeysToRemove = new Set<string>();

            for (const syncRecord of existingSyncRecords) {
              if (
                syncRecord.externalIdentifier &&
                !activeExternalIdentifiers.has(syncRecord.externalIdentifier) &&
                existingCertKeyNames.has(syncRecord.externalIdentifier)
              ) {
                certKeysToRemove.add(syncRecord.externalIdentifier);
              }
            }

            const namingPrefix = certificateNameSchema ? certificateNameSchema.split("{{")[0] : "Infisical-";

            if (namingPrefix) {
              for (const certKeyName of existingCertKeyNames) {
                if (certKeyName.startsWith(namingPrefix) && !activeExternalIdentifiers.has(certKeyName)) {
                  certKeysToRemove.add(certKeyName);
                }
              }
            }

            for (const certKeyName of certKeysToRemove) {
              try {
                await removeNetScalerCertificate(session, certKeyName, config);

                removed += 1;

                logger.info(
                  `NetScaler PKI sync [syncId=${pkiSync.id}]: removed orphaned certificate "${certKeyName}" from ${credentials.hostname}`
                );
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                failedRemovals.push({ name: certKeyName, error: errorMessage });

                logger.error(
                  { error },
                  `NetScaler PKI sync [syncId=${pkiSync.id}]: failed to remove certificate "${certKeyName}"`
                );
              }
            }
          }

          await saveNetScalerConfig(session);
        } finally {
          await logoutNetScalerSession(session);
        }

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

    const credentials = getNetScalerCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TNetScalerPkiSyncConfig;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const certKeyNamesToRemove: string[] = [];
    const certificateIdsToClean: string[] = [];

    for (const certName of certificateNames) {
      if (deps?.certificateMap?.[certName]?.certificateId) {
        const { certificateId } = deps.certificateMap[certName];

        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);

        if (syncRecord?.externalIdentifier && typeof certificateId === "string") {
          certKeyNamesToRemove.push(syncRecord.externalIdentifier);
          certificateIdsToClean.push(certificateId);
        }
      }
    }

    if (certKeyNamesToRemove.length === 0) {
      return;
    }

    await executeNetScalerOperationWithGateway(
      { gatewayId: pkiSync.connection.gatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        const session = await createNetScalerSession(credentials, makeRequest);

        try {
          for (const certKeyName of certKeyNamesToRemove) {
            try {
              await removeNetScalerCertificate(session, certKeyName, config);

              logger.info(
                `NetScaler PKI sync [syncId=${pkiSync.id}]: removed certificate "${certKeyName}" from ${credentials.hostname}`
              );
            } catch (error: unknown) {
              if (error instanceof AxiosError && error.response?.status === 404) {
                logger.info(
                  `NetScaler PKI sync [syncId=${pkiSync.id}]: certificate "${certKeyName}" already removed from ${credentials.hostname}`
                );
                // eslint-disable-next-line no-continue
                continue;
              }

              logger.error(
                { error },
                `NetScaler PKI sync [syncId=${pkiSync.id}]: failed to remove certificate "${certKeyName}"`
              );
              throw new PkiSyncError({
                message: `Failed to remove certificate "${certKeyName}" from NetScaler: ${error instanceof Error ? error.message : "Unknown error"}`,
                shouldRetry: true
              });
            }
          }

          await saveNetScalerConfig(session);
        } finally {
          await logoutNetScalerSession(session);
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
