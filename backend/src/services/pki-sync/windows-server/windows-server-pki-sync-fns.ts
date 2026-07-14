/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import { executeWinRMGatewayOperation, TWinRMConnection, TWinRMCredentials } from "@app/services/app-connection/winrm";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { TSyncMetadata } from "@app/services/certificate-sync/certificate-sync-schemas";

import { exportCertificateForSync, PemCertificateExtension, PkiSyncExportFormat } from "../pki-sync-export-fns";
import { TCertificateMap, TPkiSyncSyncResult, TPkiSyncWithCredentials } from "../pki-sync-types";
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
  pemCertificateExtension?: PemCertificateExtension;
  combineCertificateChain?: boolean;
  includePrivateKey?: boolean;
  canRemoveCertificates?: boolean;
  fileAccessRules?: Array<{ identity: string; access: string }>;
};

const TRAILING_BACKSLASH = new RE2("\\\\+$");
const joinWindowsPath = (dir: string, name: string): string => `${dir.replace(TRAILING_BACKSLASH, "")}\\${name}`;

const buildWinRMTarget = (pkiSync: TPkiSyncWithCredentials) => {
  const { connection } = pkiSync;
  const credentials = connection.credentials as TWinRMConnection["credentials"];

  const winrmCredentials: TWinRMCredentials = {
    host: credentials.host,
    port: credentials.port ?? 5985,
    username: credentials.username,
    password: credentials.password,
    sslEnabled: credentials.sslEnabled,
    sslRejectUnauthorized: credentials.sslRejectUnauthorized,
    sslCertificate: credentials.sslCertificate
  };

  return {
    credentials: winrmCredentials,
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId
  };
};

// Deletes files for tracked certificates that are no longer in the active set (revoked, expired, or
// unlinked from the sync) and drops their tracking rows. Paths just (re)written this run are skipped
// so a renewal that reuses a file name does not delete its own freshly delivered file.
const reconcileWindowsServerRemovals = async (args: {
  pkiSync: TPkiSyncWithCredentials;
  certificateMap: TCertificateMap;
  deliveredPaths: Set<string>;
  target: ReturnType<typeof buildWinRMTarget>;
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findByPkiSyncId" | "removeCertificates">;
  gatewayDeps: Parameters<typeof executeWinRMGatewayOperation>[1];
}): Promise<{ removed: number; failedRemovals: Array<{ name: string; error: string }> }> => {
  const { pkiSync, certificateMap, deliveredPaths, target, certificateSyncDAL, gatewayDeps } = args;
  const failedRemovals: Array<{ name: string; error: string }> = [];
  let removed = 0;

  const activeCertificateIds = new Set(
    Object.values(certificateMap)
      .map((certData) => certData.certificateId)
      .filter((id): id is string => typeof id === "string")
  );
  const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
  const orphans = existingSyncRecords.filter(
    (record) => record.certificateId && !activeCertificateIds.has(record.certificateId)
  );
  if (orphans.length === 0) return { removed, failedRemovals };

  const orphanPaths = orphans
    .flatMap((record) => {
      const files = (record.syncMetadata as TSyncMetadata)?.files;
      return files?.length ? files : [record.externalIdentifier].filter((p): p is string => Boolean(p));
    })
    .filter((filePath) => !deliveredPaths.has(filePath));

  try {
    if (orphanPaths.length > 0) {
      await executeWinRMGatewayOperation(
        { ...target, endpoint: WinRmRpcEndpoint.RemoveFiles, params: { paths: orphanPaths } },
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

  return { removed, failedRemovals };
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
  ): Promise<TPkiSyncSyncResult> => {
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
          alias: baseName,
          pemCertificateExtension: options.pemCertificateExtension,
          combineCertificateChain: options.combineCertificateChain
        });

        const paths: string[] = [];
        const files: Array<{ path: string; contentBase64: string }> = [];
        for (const file of exported) {
          const fullPath = joinWindowsPath(config.destinationPath, `${baseName}${file.suffix}`);
          files.push({ path: fullPath, contentBase64: file.content.toString("base64") });
          paths.push(fullPath);
          deliveredPaths.add(fullPath);
        }

        await executeWinRMGatewayOperation(
          {
            ...target,
            endpoint: WinRmRpcEndpoint.DeliverFiles,
            params: { files, accessRules: options.fileAccessRules ?? [] }
          },
          gatewayDeps
        );

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

    // Delete files for certificates no longer active and drop their tracking rows.
    if (canRemoveCertificates) {
      const reconciliation = await reconcileWindowsServerRemovals({
        pkiSync,
        certificateMap,
        deliveredPaths,
        target,
        certificateSyncDAL,
        gatewayDeps
      });
      removed += reconciliation.removed;
      failedRemovals.push(...reconciliation.failedRemovals);
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
      const recordFiles = (record.syncMetadata as TSyncMetadata)?.files;
      if (recordFiles?.length) {
        recordFiles.forEach((f) => pathsToRemove.add(f));
      } else if (record.externalIdentifier) {
        pathsToRemove.add(record.externalIdentifier);
      }
    }

    if (pathsToRemove.size > 0) {
      const target = buildWinRMTarget(pkiSync);
      await executeWinRMGatewayOperation(
        { ...target, endpoint: WinRmRpcEndpoint.RemoveFiles, params: { paths: Array.from(pathsToRemove) } },
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
