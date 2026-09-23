import {
  applyHostCommandOptionUpdate,
  buildHostCommandContext,
  buildHostCommandFailureMessage,
  HostCommandKind,
  normalizeNewHostCommandOption,
  runHostCommand,
  THostCommandCertificate,
  THostCommandContext,
  THostCommandExecutionResult,
  THostCommandResult
} from "./pki-sync-host-command-fns";

export const POST_SYNC_COMMAND_OPTION_KEY = "postSyncCommand";

export type TPostSyncCommandContext = THostCommandContext;

export type TPostSyncCommandResult = THostCommandResult;

export type TPostSyncCommandPlan = { command: string; context: TPostSyncCommandContext };

export const getPostSyncCommand = (syncOptions: unknown): string | undefined =>
  (syncOptions as Record<string, unknown> | undefined)?.[POST_SYNC_COMMAND_OPTION_KEY] as string | undefined;

export const normalizeNewPostSyncCommand = (syncOptions: Record<string, unknown>): Record<string, unknown> =>
  normalizeNewHostCommandOption(syncOptions, POST_SYNC_COMMAND_OPTION_KEY);

export const applyPostSyncCommandUpdate = (
  resolvedSyncOptions: Record<string, unknown>,
  storedCommand: unknown
): Record<string, unknown> =>
  applyHostCommandOptionUpdate(resolvedSyncOptions, POST_SYNC_COMMAND_OPTION_KEY, storedCommand);

/**
 * Assembles what a post-sync command needs, or undefined when there is no command or the run
 * delivered nothing to activate.
 */
export const buildPostSyncCommandPlan = (args: {
  command?: string;
  destinationDirectory: string;
  deliveredPaths: Set<string>;
  deliveredCertificates: THostCommandCertificate[];
  pkcs12Password?: string;
}): TPostSyncCommandPlan | undefined => {
  const { command, destinationDirectory, deliveredPaths, deliveredCertificates, pkcs12Password } = args;
  if (!command || deliveredCertificates.length === 0) return undefined;

  return {
    command,
    context: buildHostCommandContext({
      kind: HostCommandKind.PostSync,
      command,
      destinationDirectory,
      certificates: deliveredCertificates,
      certificateFiles: Array.from(deliveredPaths),
      pkcs12Password
    })
  };
};

export const runPostSyncCommand = (args: {
  syncId: string;
  execute: () => Promise<THostCommandExecutionResult>;
  secretsToRedact?: Array<string | undefined>;
}): Promise<TPostSyncCommandResult> => runHostCommand({ ...args, kind: HostCommandKind.PostSync });

export const buildPostSyncCommandFailureMessage = (result: TPostSyncCommandResult): string =>
  buildHostCommandFailureMessage(HostCommandKind.PostSync, result);
