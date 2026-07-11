/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";
import path from "node:path";

import RE2 from "re2";
import { Client } from "ssh2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SshConnectionMethod } from "@app/services/app-connection/ssh/ssh-connection-enums";
import { withSshConnection } from "@app/services/app-connection/ssh/ssh-connection-fns";
import { TSshConnectionConfig } from "@app/services/app-connection/ssh/ssh-connection-types";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";

import { PkiSyncError } from "../pki-sync-errors";
import { exportCertificateForSync, PkiSyncExportFormat } from "../pki-sync-export-fns";
import { TCertificateMap, TPkiSyncWithCredentials } from "../pki-sync-types";
import { TLinuxServerPkiSyncConfig } from "./linux-server-pki-sync-types";

type TLinuxServerPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findByPkiSyncId" | "findByPkiSyncAndCertificate" | "updateById" | "addCertificates" | "removeCertificates"
  >;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TLinuxServerSyncOptions = {
  certificateNameSchema?: string;
  exportFormat?: PkiSyncExportFormat;
  includePrivateKey?: boolean;
  canRemoveCertificates?: boolean;
};

const buildSshConfig = (pkiSync: TPkiSyncWithCredentials): TSshConnectionConfig => {
  const { connection } = pkiSync;
  const credentials = connection.credentials as { privateKey?: string };

  let method: SshConnectionMethod;
  if (connection.method === SshConnectionMethod.SshKey || connection.method === SshConnectionMethod.Password) {
    method = connection.method as SshConnectionMethod;
  } else {
    method = credentials.privateKey ? SshConnectionMethod.SshKey : SshConnectionMethod.Password;
  }

  return {
    app: AppConnection.SSH,
    method,
    credentials: connection.credentials as TSshConnectionConfig["credentials"],
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId,
    orgId: connection.orgId
  } as TSshConnectionConfig;
};

// SFTP surfaces a missing destination directory as an ENOENT "No such file" error; matched so it
// can be reported as an actionable "directory does not exist" message rather than a raw SSH error.
const NO_SUCH_FILE_ERROR = new RE2("no such file", "i");

const openSftp = (client: Client) =>
  new Promise<import("ssh2").SFTPWrapper>((resolve, reject) => {
    client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
  });

const writeFileAtomic = (
  sftp: import("ssh2").SFTPWrapper,
  filePath: string,
  content: Buffer,
  mode: number
): Promise<void> => {
  // A per-write random suffix keeps concurrent syncs (e.g. a manual trigger overlapping an auto-sync)
  // from sharing one temp path and orphaning it: OpenSSH rename is not atomic-overwrite, so we
  // unlink-then-rename, and a shared temp name would let one job recreate the file another just moved.
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.infisical.tmp`;
  return new Promise<void>((resolve, reject) => {
    const cleanupTmpThen = (finalize: () => void) => sftp.unlink(tmpPath, () => finalize());

    sftp.writeFile(tmpPath, content, { mode }, (writeErr) => {
      if (writeErr) return reject(writeErr);
      // Remove any existing target first for portable rename semantics, then move the temp file in.
      return sftp.unlink(filePath, () => {
        sftp.rename(tmpPath, filePath, (renameErr) => {
          if (renameErr) return cleanupTmpThen(() => reject(renameErr));
          return resolve();
        });
      });
    });
  });
};

const unlinkIfExists = (sftp: import("ssh2").SFTPWrapper, filePath: string): Promise<void> =>
  new Promise<void>((resolve) => {
    sftp.unlink(filePath, () => resolve());
  });

const TEMP_FILE_MARKER = ".infisical.tmp";
// A write completes in seconds, so any temp file older than this was left by an interrupted run
// (dropped connection between write and rename) and is safe to remove even if another sync shares
// this directory.
const STALE_TEMP_AGE_SECONDS = 60;

const sweepStaleTempFiles = (sftp: import("ssh2").SFTPWrapper, dir: string): Promise<void> =>
  new Promise<void>((resolve) => {
    sftp.readdir(dir, (err, entries) => {
      if (err || !entries) return resolve();
      const cutoff = Math.floor(Date.now() / 1000) - STALE_TEMP_AGE_SECONDS;
      const stale = entries.filter((e) => e.filename.endsWith(TEMP_FILE_MARKER) && e.attrs.mtime < cutoff);
      if (stale.length === 0) return resolve();
      let remaining = stale.length;
      stale.forEach((e) => {
        sftp.unlink(path.posix.join(dir, e.filename), () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        });
      });
      return undefined;
    });
  });

export const linuxServerPkiSyncFactory = ({
  certificateSyncDAL,
  gatewayV2Service,
  gatewayPoolService
}: TLinuxServerPkiSyncFactoryDeps) => {
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
    const config = pkiSync.destinationConfig as TLinuxServerPkiSyncConfig;
    const options = (pkiSync.syncOptions ?? {}) as TLinuxServerSyncOptions;
    const format = options.exportFormat ?? PkiSyncExportFormat.Pem;
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
    let uploaded = 0;
    let removed = 0;

    const sshConfig = buildSshConfig(pkiSync);

    await withSshConnection(sshConfig, { gatewayV2Service, gatewayPoolService }, async (client) => {
      const sftp = await openSftp(client);
      await sweepStaleTempFiles(sftp, config.destinationPath);

      for (const [baseName, certData] of Object.entries(certificateMap)) {
        const { cert, privateKey, certificateChain, certificateId } = certData;

        if (!cert) {
          skippedCertificates.push({ name: baseName, reason: "Missing certificate data" });
          // eslint-disable-next-line no-continue
          continue;
        }

        // Private key is required for PKCS#12, and for PEM when the operator asked to include it.
        // If the key is not available (external CSR or HSM key), fail rather than deliver a keyless file.
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
          const files = await exportCertificateForSync({
            format,
            certificate: cert,
            certificateChain,
            privateKey,
            includePrivateKey,
            password: exportPassword,
            alias: baseName
          });

          const writtenPaths: string[] = [];
          for (const file of files) {
            const filePath = path.posix.join(config.destinationPath, `${baseName}${file.suffix}`);
            try {
              await writeFileAtomic(sftp, filePath, file.content, file.isPrivateKey ? 0o600 : 0o644);
            } catch (writeErr) {
              const msg = (writeErr as Error)?.message ?? "";
              if (NO_SUCH_FILE_ERROR.test(msg)) {
                throw new PkiSyncError({
                  message: `Destination directory "${config.destinationPath}" does not exist or is not writable`
                });
              }
              throw writeErr;
            }
            writtenPaths.push(filePath);
            deliveredPaths.add(filePath);
          }

          // Record the delivered paths so removal and re-sync act on exactly what was written.
          const primaryPath = writtenPaths[0];
          if (typeof certificateId === "string") {
            let record = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);
            if (!record) {
              [record] = await certificateSyncDAL.addCertificates(pkiSync.id, [
                { certificateId, externalIdentifier: primaryPath }
              ]);
            }
            if (record) {
              await certificateSyncDAL.updateById(record.id, {
                externalIdentifier: primaryPath,
                syncMetadata: { files: writtenPaths }
              });
            }
          }

          uploaded += 1;
          logger.info(
            `Linux Server PKI sync [syncId=${pkiSync.id}]: wrote ${writtenPaths.length} file(s) for "${baseName}"`
          );
        } catch (err) {
          failedUploads.push({ name: baseName, error: (err as Error)?.message ?? "Unknown error" });
        }
      }

      // Reconcile removals: delete files for certificates we previously delivered that are no longer
      // in the active set (revoked, expired, or unlinked from the sync), then drop their tracking
      // rows. certificateMap holds the full active set, so anything tracked but absent is orphaned.
      if (canRemoveCertificates) {
        const activeCertificateIds = new Set(
          Object.values(certificateMap)
            .map((certData) => certData.certificateId)
            .filter((id): id is string => typeof id === "string")
        );
        const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);

        for (const record of existingSyncRecords) {
          if (!record.certificateId || activeCertificateIds.has(record.certificateId)) {
            // eslint-disable-next-line no-continue
            continue;
          }
          const files = (record.syncMetadata as { files?: string[] } | undefined)?.files?.length
            ? (record.syncMetadata as { files: string[] }).files
            : [record.externalIdentifier].filter((p): p is string => Boolean(p));
          // Skip any path an active certificate just wrote: on renewal the new cert reuses the old
          // one's file name, so deleting it would remove the freshly delivered file. The stale row is
          // still dropped so the superseded certificate stops being tracked.
          const filesToDelete = files.filter((filePath) => !deliveredPaths.has(filePath));
          try {
            for (const filePath of filesToDelete) {
              await unlinkIfExists(sftp, filePath);
            }
            await certificateSyncDAL.removeCertificates(pkiSync.id, [record.certificateId]);
            if (filesToDelete.length > 0) removed += 1;
            logger.info(
              `Linux Server PKI sync [syncId=${pkiSync.id}]: removed ${filesToDelete.length} orphaned file(s) for certificate ${record.certificateId}`
            );
          } catch (err) {
            failedRemovals.push({
              name: record.externalIdentifier ?? record.certificateId,
              error: (err as Error)?.message ?? "Unknown error"
            });
          }
        }
      }
    });

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
      certificateSyncDAL?: Pick<TCertificateSyncDALFactory, "findByPkiSyncId">;
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
      const files = (record.syncMetadata as { files?: string[] } | undefined)?.files;
      if (files?.length) {
        files.forEach((f) => pathsToRemove.add(f));
      } else if (record.externalIdentifier) {
        pathsToRemove.add(record.externalIdentifier);
      }
    }

    if (pathsToRemove.size > 0) {
      const sshConfig = buildSshConfig(pkiSync);
      await withSshConnection(sshConfig, { gatewayV2Service, gatewayPoolService }, async (client) => {
        const sftp = await openSftp(client);
        for (const filePath of pathsToRemove) {
          await unlinkIfExists(sftp, filePath);
          logger.info(`Linux Server PKI sync [syncId=${pkiSync.id}]: removed "${filePath}"`);
        }
      });
    }

    // Untrack the removed certificates so they are no longer reported as synced and not re-delivered.
    if (certificateIdsToUntrack.length > 0) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToUntrack);
    }
  };

  return { syncCertificates, removeCertificates };
};
