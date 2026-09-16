/* eslint-disable no-await-in-loop */
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { WinRmRpcEndpoint, WinRmRunCommandResult } from "@app/lib/gateway-v2/winrm-rpc";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  LdapTargetConfigurationError,
  resolveLdapBackedHostCredentials
} from "@app/services/app-connection/ldap/ldap-directory-fns";
import { executeWinRMGatewayOperation, TWinRMConnection, TWinRMCredentials } from "@app/services/app-connection/winrm";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { TSyncMetadata } from "@app/services/certificate-sync/certificate-sync-schemas";

import { PkiSyncError } from "../pki-sync-errors";
import { exportCertificateForSync, PemCertificateExtension, PkiSyncExportFormat } from "../pki-sync-export-fns";
import {
  buildHealthCheckCommandFailureMessage,
  buildHealthCheckCommandPlan,
  buildHealthCheckFailureSyncResult,
  didHealthCheckFail,
  runHealthCheckCommand,
  THealthCheckCommandResult
} from "../pki-sync-health-check-command-fns";
import {
  HOST_COMMAND_TIMEOUT_MS,
  HostCommandKind,
  renderHostCommandContext,
  THostCommandContext,
  THostCommandExecutionResult,
  toPowerShellLiteral
} from "../pki-sync-host-command-fns";
import { describeHostFailure, resolveGatewayLabel, withReachabilityDeadline } from "../pki-sync-host-error-fns";
import { buildPostSyncCommandPlan, runPostSyncCommand, TPostSyncCommandPlan } from "../pki-sync-post-sync-command-fns";
import { TCertificateMap, THealthCheckTarget, TPkiSyncSyncResult, TPkiSyncWithCredentials } from "../pki-sync-types";
import { TWindowsServerPkiSyncConfig } from "./windows-server-pki-sync-types";

type TWindowsServerPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    "findByPkiSyncId" | "findByPkiSyncAndCertificate" | "updateById" | "addCertificates" | "removeCertificates"
  >;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId" | "getGatewayById">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

type TWindowsServerSyncOptions = {
  certificateNameSchema?: string;
  exportFormat?: PkiSyncExportFormat;
  pemCertificateExtension?: PemCertificateExtension;
  combineCertificateChain?: boolean;
  includePrivateKey?: boolean;
  canRemoveCertificates?: boolean;
  fileAccessRules?: Array<{ identity: string; access: string }>;
  healthCheckCommand?: string;
  postSyncCommand?: string;
};

const resolveWindowsExportOptions = (options: TWindowsServerSyncOptions) => ({
  format: options.exportFormat ?? PkiSyncExportFormat.Pkcs12,
  includePrivateKey: options.includePrivateKey ?? true,
  pemCertificateExtension: options.pemCertificateExtension,
  combineCertificateChain: options.combineCertificateChain
});

const TRAILING_BACKSLASH = new RE2("\\\\+$");
const joinWindowsPath = (dir: string, name: string): string => `${dir.replace(TRAILING_BACKSLASH, "")}\\${name}`;

type TWinRMSyncTarget = {
  credentials: TWinRMCredentials;
  gatewayId?: string;
  gatewayPoolId?: string | null;
};

type TGatewayServices = Pick<TWindowsServerPkiSyncFactoryDeps, "gatewayV2Service" | "gatewayPoolService" | "keyStore">;

const DEFAULT_WINRM_PORT = 5985;
const DEFAULT_WINRM_HTTPS_PORT = 5986;

const buildLdapBackedWinRMTarget = async (
  pkiSync: THealthCheckTarget,
  gatewayServices: TGatewayServices
): Promise<TWinRMSyncTarget> => {
  const { connection } = pkiSync;
  const { host, port, sslEnabled, sslRejectUnauthorized, sslCertificate } =
    pkiSync.destinationConfig as TWindowsServerPkiSyncConfig;

  const credentials = await resolveLdapBackedHostCredentials(
    { connection, host },
    {
      gatewayV2Service: gatewayServices.gatewayV2Service,
      gatewayPoolService: gatewayServices.gatewayPoolService,
      keyStore: gatewayServices.keyStore
    }
  ).catch((err: unknown) => {
    if (err instanceof LdapTargetConfigurationError) {
      throw new PkiSyncError({ shouldRetry: false, message: err.message });
    }
    throw err;
  });

  return {
    credentials: {
      ...credentials,
      port: port ?? (sslEnabled ? DEFAULT_WINRM_HTTPS_PORT : DEFAULT_WINRM_PORT),
      sslEnabled,
      sslRejectUnauthorized,
      sslCertificate
    },
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId
  };
};

const buildWinRMTarget = async (
  pkiSync: THealthCheckTarget,
  gatewayServices: TGatewayServices
): Promise<TWinRMSyncTarget> => {
  const { connection } = pkiSync;

  if (connection.app === AppConnection.LDAP) return buildLdapBackedWinRMTarget(pkiSync, gatewayServices);

  if (connection.app !== AppConnection.WinRM) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: `A ${connection.app} connection cannot deliver to a Windows Server sync.`
    });
  }

  const credentials = connection.credentials as TWinRMConnection["credentials"];

  const winrmCredentials: TWinRMCredentials = {
    host: credentials.host,
    port: credentials.port ?? DEFAULT_WINRM_PORT,
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
  target: TWinRMSyncTarget;
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

const executeWindowsServerHostCommand = async (
  kind: HostCommandKind,
  plan: { command: string; context: THostCommandContext },
  target: TWinRMSyncTarget,
  gatewayDeps: Parameters<typeof executeWinRMGatewayOperation>[1]
): Promise<THostCommandExecutionResult> => {
  const result = await executeWinRMGatewayOperation<WinRmRunCommandResult>(
    {
      ...target,
      endpoint: WinRmRpcEndpoint.RunCommand,
      params: {
        command: renderHostCommandContext(plan.command, plan.context, toPowerShellLiteral),
        timeoutMs: HOST_COMMAND_TIMEOUT_MS[kind]
      }
    },
    gatewayDeps
  );
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
};

const runWindowsServerHealthCheckCommand = async ({
  pkiSync,
  certificateMap,
  resolveTarget,
  gatewayDeps
}: {
  pkiSync: THealthCheckTarget;
  certificateMap: TCertificateMap;
  resolveTarget: () => Promise<TWinRMSyncTarget>;
  gatewayDeps: Parameters<typeof executeWinRMGatewayOperation>[1];
}): Promise<THealthCheckCommandResult | undefined> => {
  const options = (pkiSync.syncOptions ?? {}) as TWindowsServerSyncOptions;
  const config = pkiSync.destinationConfig as TWindowsServerPkiSyncConfig;
  const exportOptions = resolveWindowsExportOptions(options);

  const plan = buildHealthCheckCommandPlan({
    command: options.healthCheckCommand,
    destinationDirectory: config.destinationPath,
    certificateMap,
    exportOptions,
    joinPath: joinWindowsPath,
    pkcs12Password:
      exportOptions.format === PkiSyncExportFormat.Pkcs12 ? pkiSync.syncCredentials?.exportPassword : undefined
  });
  if (!plan) return undefined;

  const target = await resolveTarget().catch((err: unknown) => err as Error);

  return runHealthCheckCommand({
    syncId: pkiSync.id,
    secretsToRedact: [plan.context.pkcs12Password],
    execute: async () => {
      if (target instanceof Error) throw target;
      return executeWindowsServerHostCommand(HostCommandKind.HealthCheck, plan, target, gatewayDeps);
    }
  });
};

const runWindowsServerPostSyncCommand = ({
  syncId,
  plan,
  target,
  gatewayDeps
}: {
  syncId: string;
  plan: TPostSyncCommandPlan;
  target: TWinRMSyncTarget;
  gatewayDeps: Parameters<typeof executeWinRMGatewayOperation>[1];
}) =>
  runPostSyncCommand({
    syncId,
    secretsToRedact: [plan.context.pkcs12Password],
    execute: () => executeWindowsServerHostCommand(HostCommandKind.PostSync, plan, target, gatewayDeps)
  });

export const windowsServerPkiSyncFactory = ({
  certificateSyncDAL,
  gatewayV2Service,
  gatewayPoolService,
  keyStore
}: TWindowsServerPkiSyncFactoryDeps) => {
  const gatewayDeps = { gatewayV2Service, gatewayPoolService, keyStore };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<TPkiSyncSyncResult> => {
    const config = pkiSync.destinationConfig as TWindowsServerPkiSyncConfig;
    const options = (pkiSync.syncOptions ?? {}) as TWindowsServerSyncOptions;
    const exportOptions = resolveWindowsExportOptions(options);
    const { format, includePrivateKey } = exportOptions;
    const canRemoveCertificates = options.canRemoveCertificates ?? false;
    const exportPassword = pkiSync.syncCredentials?.exportPassword;

    const failedUploads: Array<{ name: string; error: string }> = [];
    const failedRemovals: Array<{ name: string; error: string }> = [];
    const skippedCertificates: Array<{ name: string; reason: string }> = [];
    // Paths confirmed on the host this run. Keeps the removal pass from deleting a file a renewal
    // just rewrote under the same name, and tells the post-sync command what landed.
    const deliveredPaths = new Set<string>();
    const deliveredCertificates: Array<{ paths: string[]; commonName?: string }> = [];
    const target = await buildWinRMTarget(pkiSync, gatewayDeps);
    const gatewayLabel = await resolveGatewayLabel(gatewayV2Service, target.gatewayId);
    const describeFailure = (error: unknown) =>
      describeHostFailure({ error, host: config.host, gatewayLabel, transport: "WinRM" });
    let uploaded = 0;
    let removed = 0;

    const healthCheck = await runWindowsServerHealthCheckCommand({
      pkiSync,
      certificateMap,
      resolveTarget: async () => target,
      gatewayDeps
    });
    if (healthCheck && didHealthCheckFail(healthCheck)) {
      logger.info(
        `Windows Server PKI sync [syncId=${pkiSync.id}]: health check failed, delivered nothing (${buildHealthCheckCommandFailureMessage(healthCheck)})`
      );
      return buildHealthCheckFailureSyncResult(certificateMap, healthCheck);
    }

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
          ...exportOptions,
          certificate: cert,
          certificateChain,
          privateKey,
          password: exportPassword,
          alias: baseName
        });

        const paths: string[] = [];
        const files: Array<{ path: string; contentBase64: string }> = [];
        for (const file of exported) {
          const fullPath = joinWindowsPath(config.destinationPath, `${baseName}${file.suffix}`);
          files.push({ path: fullPath, contentBase64: file.content.toString("base64") });
          paths.push(fullPath);
        }

        await executeWinRMGatewayOperation(
          {
            ...target,
            endpoint: WinRmRpcEndpoint.DeliverFiles,
            params: { files, accessRules: options.fileAccessRules ?? [] }
          },
          gatewayDeps
        );

        paths.forEach((deliveredPath) => deliveredPaths.add(deliveredPath));
        deliveredCertificates.push({ paths, commonName: certData.commonName ?? undefined });
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
        failedUploads.push({ name: baseName, error: describeFailure(err) });
      }
    }

    // Delete files for certificates no longer active and drop their tracking rows.
    if (canRemoveCertificates && failedUploads.length === 0) {
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
    } else if (canRemoveCertificates) {
      logger.info(
        `Windows Server PKI sync [syncId=${pkiSync.id}]: skipped certificate removal because ${failedUploads.length} certificate(s) failed to deliver`
      );
    }

    const postSyncCommandPlan = buildPostSyncCommandPlan({
      command: options.postSyncCommand,
      destinationDirectory: config.destinationPath,
      deliveredPaths,
      deliveredCertificates,
      pkcs12Password: format === PkiSyncExportFormat.Pkcs12 ? exportPassword : undefined
    });
    const postSyncCommand = postSyncCommandPlan
      ? await runWindowsServerPostSyncCommand({
          syncId: pkiSync.id,
          plan: postSyncCommandPlan,
          target,
          gatewayDeps
        })
      : undefined;

    return {
      uploaded,
      removed: removed > 0 ? removed : undefined,
      failedRemovals: failedRemovals.length > 0 ? failedRemovals.length : undefined,
      skipped: skippedCertificates.length,
      healthCheck,
      postSyncCommand,
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
      const target = await buildWinRMTarget(pkiSync, gatewayDeps);
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

  const runHealthCheck = (pkiSync: THealthCheckTarget, certificateMap: TCertificateMap) =>
    runWindowsServerHealthCheckCommand({
      pkiSync,
      certificateMap,
      resolveTarget: () => buildWinRMTarget(pkiSync, gatewayDeps),
      gatewayDeps
    });

  const testReachability = async (pkiSync: TPkiSyncWithCredentials): Promise<void> => {
    const target = await buildWinRMTarget(pkiSync, gatewayDeps);
    const { host } = pkiSync.destinationConfig as TWindowsServerPkiSyncConfig;

    try {
      await withReachabilityDeadline(() =>
        executeWinRMGatewayOperation({ ...target, endpoint: WinRmRpcEndpoint.Test }, gatewayDeps)
      );
    } catch (err) {
      const gatewayLabel = await resolveGatewayLabel(gatewayV2Service, target.gatewayId);
      throw new PkiSyncError({
        shouldRetry: false,
        message: describeHostFailure({ error: err, host, gatewayLabel, transport: "WinRM" })
      });
    }
  };

  return { syncCertificates, removeCertificates, runHealthCheck, testReachability };
};
