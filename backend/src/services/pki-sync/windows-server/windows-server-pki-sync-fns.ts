/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { executeWinRMGatewayOperation, TWinRMConnection, TWinRMCredentials } from "@app/services/app-connection/winrm";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";

import { exportCertificateForSync, PkiSyncExportFormat } from "../pki-sync-export-fns";
import { TCertificateMap, TPkiSyncWithCredentials } from "../pki-sync-types";
import { TWindowsServerPkiSyncConfig } from "./windows-server-pki-sync-types";

type TWindowsServerPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findByPkiSyncId" | "findByPkiSyncAndCertificate" | "updateById" | "addCertificates" | "removeCertificates"
  >;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TWindowsServerSyncOptions = {
  certificateNameSchema?: string;
  exportFormat?: PkiSyncExportFormat;
  includePrivateKey?: boolean;
  canRemoveCertificates?: boolean;
};

const TRAILING_BACKSLASH = new RE2("\\\\+$");
const winPathJoin = (dir: string, name: string): string => `${dir.replace(TRAILING_BACKSLASH, "")}\\${name}`;

const buildWinRMTarget = (pkiSync: TPkiSyncWithCredentials) => {
  const { connection } = pkiSync;
  const credentials = connection.credentials as TWinRMConnection["credentials"];

  const winrmCredentials: TWinRMCredentials = {
    host: credentials.host,
    port: credentials.port ?? 5985,
    username: credentials.username,
    password: credentials.password,
    useHttps: credentials.useHttps,
    insecure: credentials.insecure
  };

  return {
    credentials: winrmCredentials,
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId
  };
};

export const windowsServerPkiSyncFactory = ({
  certificateSyncDAL,
  gatewayV2Service,
  gatewayPoolService
}: TWindowsServerPkiSyncFactoryDeps) => {
  const gatewayDeps = { gatewayV2Service, gatewayPoolService };

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
    const config = pkiSync.destinationConfig as TWindowsServerPkiSyncConfig;
    const options = (pkiSync.syncOptions ?? {}) as TWindowsServerSyncOptions;
    const format = options.exportFormat ?? PkiSyncExportFormat.Pkcs12;
    const includePrivateKey = options.includePrivateKey ?? true;
    const canRemoveCertificates = options.canRemoveCertificates ?? false;
    const exportPassword = pkiSync.syncCredentials?.exportPassword;

    const failedUploads: Array<{ name: string; error: string }> = [];
    const failedRemovals: Array<{ name: string; error: string }> = [];
    const skippedCertificates: Array<{ name: string; reason: string }> = [];
    // Paths written for currently-active certificates this run. A renewed cert reuses the same file
    // name as the cert it replaced, so removal reconciliation must not delete a path that was just
    // (re)written here, or a renewal would delete its own freshly delivered file.
    const deliveredPaths = new Set<string>();
    const target = buildWinRMTarget(pkiSync);
    let uploaded = 0;
    let removed = 0;

    // Deliver each certificate over its own gateway operation so one certificate's failure is
    // recorded against that certificate only, rather than failing the whole batch.
    for (const [baseName, certData] of Object.entries(certificateMap)) {
      const { cert, privateKey, certificateChain, certificateId } = certData;

      if (!cert) {
        skippedCertificates.push({ name: baseName, reason: "Missing certificate data" });
        // eslint-disable-next-line no-continue
        continue;
      }

      const keyRequired = format === PkiSyncExportFormat.Pkcs12 || includePrivateKey;
      if (keyRequired && !privateKey) {
        failedUploads.push({
          name: baseName,
          error:
            "Private key is required but is not available for this certificate (for example, it was issued from an external CSR)"
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        const exported = await exportCertificateForSync({
          format,
          certificate: cert,
          certificateChain,
          privateKey,
          includePrivateKey,
          password: exportPassword,
          alias: baseName
        });

        const paths: string[] = [];
        const files: Array<{ path: string; contentBase64: string }> = [];
        for (const file of exported) {
          const fullPath = winPathJoin(config.destinationPath, `${baseName}${file.suffix}`);
          files.push({ path: fullPath, contentBase64: file.content.toString("base64") });
          paths.push(fullPath);
          deliveredPaths.add(fullPath);
        }

        await executeWinRMGatewayOperation({ ...target, endpoint: "/v1/deliver", params: { files } }, gatewayDeps);

        if (typeof certificateId === "string") {
          let record = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
          if (!record) {
            [record] = await certificateSyncDAL.addCertificates(pkiSync.id, [
              { certificateId, externalIdentifier: paths[0] }
            ]);
          }
          if (record) {
            await certificateSyncDAL.updateById(record.id, {
              externalIdentifier: paths[0],
              syncMetadata: { files: paths }
            });
          }
        }
        uploaded += 1;
      } catch (err) {
        failedUploads.push({ name: baseName, error: (err as Error)?.message ?? "Unknown error" });
      }
    }

    // Reconcile removals: delete files for certificates we previously delivered that are no longer
    // in the active set (revoked, expired, or unlinked from the sync), then drop their tracking rows.
    // certificateMap holds the full active set, so anything tracked but absent is orphaned.
    if (canRemoveCertificates) {
      const activeCertificateIds = new Set(
        Object.values(certificateMap)
          .map((certData) => certData.certificateId)
          .filter((id): id is string => typeof id === "string")
      );
      const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
      const orphans = existingSyncRecords.filter(
        (record) => record.certificateId && !activeCertificateIds.has(record.certificateId)
      );

      if (orphans.length > 0) {
        // Skip any path an active certificate just wrote: on renewal the new cert reuses the old
        // one's file name, so deleting it would remove the freshly delivered file. The stale rows are
        // still dropped so superseded certificates stop being tracked.
        const orphanPaths = orphans
          .flatMap((record) => {
            const files = (record.syncMetadata as { files?: string[] } | undefined)?.files;
            return files?.length ? files : [record.externalIdentifier].filter((p): p is string => Boolean(p));
          })
          .filter((filePath) => !deliveredPaths.has(filePath));

        try {
          if (orphanPaths.length > 0) {
            await executeWinRMGatewayOperation(
              { ...target, endpoint: "/v1/remove", params: { paths: orphanPaths } },
              gatewayDeps
            );
          }
          await certificateSyncDAL.removeCertificates(
            pkiSync.id,
            orphans.map((record) => record.certificateId)
          );
          removed = orphanPaths.length > 0 ? orphans.length : 0;
        } catch (err) {
          failedRemovals.push({
            name: `${orphans.length} certificate(s)`,
            error: (err as Error)?.message ?? "Unknown error"
          });
        }
      }
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
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: {
      certificateMap?: TCertificateMap;
    }
  ): Promise<void> => {
    if (certificateNames.length === 0) return;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const pathsToRemove = new Set<string>();
    const certificateIdsToUntrack: string[] = [];

    for (const certName of certificateNames) {
      const certificateId = deps?.certificateMap?.[certName]?.certificateId;
      const record = certificateId ? existingSyncRecords.find((r) => r.certificateId === certificateId) : undefined;
      if (!certificateId || !record) {
        // eslint-disable-next-line no-continue
        continue;
      }
      certificateIdsToUntrack.push(certificateId);
      const recordFiles = (record.syncMetadata as { files?: string[] } | undefined)?.files;
      if (recordFiles?.length) {
        recordFiles.forEach((f) => pathsToRemove.add(f));
      } else if (record.externalIdentifier) {
        pathsToRemove.add(record.externalIdentifier);
      }
    }

    if (pathsToRemove.size > 0) {
      const target = buildWinRMTarget(pkiSync);
      await executeWinRMGatewayOperation(
        { ...target, endpoint: "/v1/remove", params: { paths: Array.from(pathsToRemove) } },
        gatewayDeps
      );
    }

    // Untrack the removed certificates so they are no longer reported as synced and not re-delivered.
    if (certificateIdsToUntrack.length > 0) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToUntrack);
    }
  };

  return { syncCertificates, removeCertificates };
};
