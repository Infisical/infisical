import { PkiSyncStatus } from "./pki-sync-enums";
import {
  getExportedCertificateFileSuffixes,
  PemCertificateExtension,
  PkiSyncExportFormat
} from "./pki-sync-export-fns";
import {
  applyHostCommandOptionUpdate,
  buildHostCommandContext,
  buildHostCommandFailureMessage,
  HOST_COMMAND_MAX_LENGTH,
  HostCommandKind,
  normalizeNewHostCommandOption,
  renderHostCommandContext,
  runHostCommand,
  THostCommandCertificate,
  THostCommandContext,
  THostCommandExecutionResult,
  THostCommandResult,
  withHostCommandDeadline
} from "./pki-sync-host-command-fns";
import { TCertificateMap, TPkiSyncSyncResult } from "./pki-sync-types";

export const PREFLIGHT_COMMAND_MAX_LENGTH = HOST_COMMAND_MAX_LENGTH;

export const PREFLIGHT_COMMAND_TIMEOUT_MS = 10_000;

const PREFLIGHT_DEADLINE_GRACE_MS = 5_000;

export const PREFLIGHT_COMMAND_OPTION_KEY = "preflightCommand";

export type TPreflightCommandResult = THostCommandResult;

export const getPreflightCommand = (syncOptions: unknown): string | undefined =>
  (syncOptions as Record<string, unknown> | undefined)?.[PREFLIGHT_COMMAND_OPTION_KEY] as string | undefined;

export const normalizeNewPreflightCommand = (syncOptions: Record<string, unknown>): Record<string, unknown> =>
  normalizeNewHostCommandOption(syncOptions, PREFLIGHT_COMMAND_OPTION_KEY);

export const applyPreflightCommandUpdate = (
  resolvedSyncOptions: Record<string, unknown>,
  storedCommand: unknown
): Record<string, unknown> =>
  applyHostCommandOptionUpdate(resolvedSyncOptions, PREFLIGHT_COMMAND_OPTION_KEY, storedCommand);

type TPreflightExportOptions = {
  format: PkiSyncExportFormat;
  includePrivateKey: boolean;
  pemCertificateExtension?: PemCertificateExtension;
  combineCertificateChain?: boolean;
};

const buildProspectiveCertificates = (args: {
  certificateMap: TCertificateMap;
  destinationDirectory: string;
  exportOptions: TPreflightExportOptions;
  joinPath: (directory: string, fileName: string) => string;
}): THostCommandCertificate[] => {
  const { certificateMap, destinationDirectory, exportOptions, joinPath } = args;

  return Object.entries(certificateMap).map(([baseName, certData]) => ({
    paths: getExportedCertificateFileSuffixes({
      ...exportOptions,
      hasCertificateChain: Boolean(certData.certificateChain),
      hasPrivateKey: Boolean(certData.privateKey)
    }).map((suffix) => joinPath(destinationDirectory, `${baseName}${suffix}`)),
    commonName: certData.commonName ?? undefined
  }));
};

export const buildPreflightCommandPlan = (args: {
  command?: string;
  destinationDirectory: string;
  certificateMap: TCertificateMap;
  exportOptions: TPreflightExportOptions;
  joinPath: (directory: string, fileName: string) => string;
  pkcs12Password?: string;
}): { command: string; context: THostCommandContext } | undefined => {
  const { command, destinationDirectory, certificateMap, exportOptions, joinPath, pkcs12Password } = args;
  if (!command) return undefined;

  return {
    command,
    context: buildHostCommandContext({
      kind: HostCommandKind.Preflight,
      command,
      destinationDirectory,
      certificates: buildProspectiveCertificates({
        certificateMap,
        destinationDirectory,
        exportOptions,
        joinPath
      }),
      pkcs12Password
    })
  };
};

export const renderPreflightCommand = renderHostCommandContext;

export const runPreflightCommand = (args: {
  syncId: string;
  execute: () => Promise<THostCommandExecutionResult>;
  secretsToRedact?: Array<string | undefined>;
}): Promise<TPreflightCommandResult> =>
  runHostCommand({
    syncId: args.syncId,
    kind: HostCommandKind.Preflight,
    secretsToRedact: args.secretsToRedact,
    execute: () => withHostCommandDeadline(args.execute, PREFLIGHT_COMMAND_TIMEOUT_MS, PREFLIGHT_DEADLINE_GRACE_MS)
  });

export const buildPreflightCommandFailureMessage = (result: TPreflightCommandResult): string =>
  buildHostCommandFailureMessage(HostCommandKind.Preflight, result);

export const didPreflightCheckFail = (result: TPreflightCommandResult | undefined): boolean =>
  result?.status === PkiSyncStatus.Failed;

export const buildPreflightFailureSyncResult = (
  certificateMap: TCertificateMap,
  result: TPreflightCommandResult
): TPkiSyncSyncResult => {
  const reason = buildPreflightCommandFailureMessage(result);
  const certificateNames = Object.keys(certificateMap);

  return {
    uploaded: 0,
    skipped: certificateNames.length,
    preflightCheck: result,
    details: {
      skippedCertificates: certificateNames.map((name) => ({ name, reason }))
    }
  };
};
