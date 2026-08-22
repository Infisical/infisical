import { BadRequestError } from "@app/lib/errors";

import { HEALTH_CHECK_COMMAND_OPTION_KEY, PkiSyncStatus } from "./pki-sync-enums";
import {
  getExportedCertificateFileSuffixes,
  PemCertificateExtension,
  PkiSyncExportFormat
} from "./pki-sync-export-fns";
import {
  applyHostCommandOptionUpdate,
  buildHostCommandContext,
  buildHostCommandFailureMessage,
  commandNeedsCertificateData,
  commandUsesHostCommandVariable,
  findCertificateDependentHostCommandVariables,
  formatHostCommandVariables,
  HostCommandKind,
  HostCommandVariable,
  normalizeNewHostCommandOption,
  runHostCommand,
  THostCommandCertificate,
  THostCommandContext,
  THostCommandExecutionResult,
  THostCommandResult
} from "./pki-sync-host-command-fns";
import { TCertificateMap, TPkiSyncSyncResult } from "./pki-sync-types";

export type THealthCheckCommandResult = THostCommandResult;

export const getHealthCheckCommand = (syncOptions: unknown): string | undefined =>
  (syncOptions as Record<string, unknown> | undefined)?.[HEALTH_CHECK_COMMAND_OPTION_KEY] as string | undefined;

export const normalizeNewHealthCheckCommand = (syncOptions: Record<string, unknown>): Record<string, unknown> =>
  normalizeNewHostCommandOption(syncOptions, HEALTH_CHECK_COMMAND_OPTION_KEY);

export const applyHealthCheckCommandUpdate = (
  resolvedSyncOptions: Record<string, unknown>,
  storedCommand: unknown
): Record<string, unknown> =>
  applyHostCommandOptionUpdate(resolvedSyncOptions, HEALTH_CHECK_COMMAND_OPTION_KEY, storedCommand);

export const assertHealthCheckCommandIsTestable = (syncOptions: Record<string, unknown>): string => {
  const command = getHealthCheckCommand(syncOptions);
  if (!command) {
    throw new BadRequestError({ message: "Enter a health check command to test." });
  }

  const certificateVariables = findCertificateDependentHostCommandVariables(command);
  if (certificateVariables.length > 0) {
    throw new BadRequestError({
      message: `A test cannot resolve ${formatHostCommandVariables(
        certificateVariables
      )} because no certificate is linked yet. Use {{certificateDirectory}} to test, or save the sync and run the health check from its actions menu.`
    });
  }

  if (commandUsesHostCommandVariable(command, HostCommandVariable.Pkcs12Password)) {
    throw new BadRequestError({
      message: `A test cannot resolve ${formatHostCommandVariables([
        HostCommandVariable.Pkcs12Password
      ])} because the export password belongs to a saved sync. Save the sync and run the health check from its actions menu.`
    });
  }

  return command;
};

type THealthCheckExportOptions = {
  format: PkiSyncExportFormat;
  includePrivateKey: boolean;
  pemCertificateExtension?: PemCertificateExtension;
  combineCertificateChain?: boolean;
};

const buildProspectiveCertificates = (args: {
  certificateMap: TCertificateMap;
  destinationDirectory: string;
  exportOptions: THealthCheckExportOptions;
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

export const buildHealthCheckCommandPlan = (args: {
  command?: string;
  destinationDirectory: string;
  certificateMap: TCertificateMap;
  exportOptions: THealthCheckExportOptions;
  joinPath: (directory: string, fileName: string) => string;
  pkcs12Password?: string;
}): { command: string; context: THostCommandContext } | undefined => {
  const { command, destinationDirectory, certificateMap, exportOptions, joinPath, pkcs12Password } = args;
  if (!command) return undefined;

  if (commandNeedsCertificateData(command) && Object.keys(certificateMap).length === 0) return undefined;

  return {
    command,
    context: buildHostCommandContext({
      kind: HostCommandKind.HealthCheck,
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

export const runHealthCheckCommand = (args: {
  syncId: string;
  execute: () => Promise<THostCommandExecutionResult>;
  secretsToRedact?: Array<string | undefined>;
}): Promise<THealthCheckCommandResult> => runHostCommand({ ...args, kind: HostCommandKind.HealthCheck });

export const buildHealthCheckCommandFailureMessage = (result: THealthCheckCommandResult): string =>
  buildHostCommandFailureMessage(HostCommandKind.HealthCheck, result);

export const SCHEDULED_HEALTH_CHECK_MESSAGE_SUBJECT = "Scheduled health check";

export const MANUAL_HEALTH_CHECK_MESSAGE_SUBJECT = "Manual health check";

export const HEALTH_CHECK_OWNED_MESSAGE_SUBJECTS = [
  SCHEDULED_HEALTH_CHECK_MESSAGE_SUBJECT,
  MANUAL_HEALTH_CHECK_MESSAGE_SUBJECT
];

export const didHealthCheckFail = (result: THealthCheckCommandResult | undefined): boolean =>
  result?.status === PkiSyncStatus.Failed;

export const toHealthCheckApiResult = (result: THealthCheckCommandResult) => ({
  status: result.status,
  exitCode: result.exitCode,
  timedOut: result.timedOut,
  durationMs: result.durationMs,
  output: result.output,
  failureDetail: result.failureDetail,
  message: didHealthCheckFail(result) ? buildHealthCheckCommandFailureMessage(result) : undefined
});

export const buildHealthCheckFailureSyncResult = (
  certificateMap: TCertificateMap,
  result: THealthCheckCommandResult
): TPkiSyncSyncResult => {
  const reason = buildHealthCheckCommandFailureMessage(result);
  const certificateNames = Object.keys(certificateMap);

  return {
    uploaded: 0,
    skipped: certificateNames.length,
    healthCheck: result,
    details: {
      skippedCertificates: certificateNames.map((name) => ({ name, reason }))
    }
  };
};

export const buildHealthCheckFailureMessageFor = (subject: string, result: THealthCheckCommandResult): string =>
  buildHostCommandFailureMessage(HostCommandKind.HealthCheck, result, subject);
