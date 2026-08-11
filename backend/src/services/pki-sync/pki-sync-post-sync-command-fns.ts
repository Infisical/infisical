import RE2 from "re2";

import { logger } from "@app/lib/logger";

import { PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";

export enum PostSyncCommandVariable {
  CertificatePath = "certificatePath",
  CertificateDirectory = "certificateDirectory",
  CertificateFiles = "certificateFiles",
  CommonName = "commonName",
  Pkcs12Password = "pkcs12Password"
}

// Matches a {{name}} variable.
const VARIABLE_PATTERN = new RE2("\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", "g");

const isPostSyncCommandVariable = (name: string): name is PostSyncCommandVariable =>
  (Object.values(PostSyncCommandVariable) as string[]).includes(name);

const SINGLE_CERTIFICATE_VARIABLES: PostSyncCommandVariable[] = [
  PostSyncCommandVariable.CertificatePath,
  PostSyncCommandVariable.CommonName
];

export const formatPostSyncCommandVariables = (variables: PostSyncCommandVariable[]): string =>
  variables.map((variable) => `{{${variable}}}`).join(", ");

export const findSingleCertificatePostSyncCommandVariables = (command?: string): PostSyncCommandVariable[] => {
  if (!command) return [];

  const used = new Set<string>();
  command.replace(VARIABLE_PATTERN, (match: string, name: string) => {
    used.add(name);
    return match;
  });

  return SINGLE_CERTIFICATE_VARIABLES.filter((variable) => used.has(variable));
};

export const POST_SYNC_COMMAND_MAX_LENGTH = 8192;

export const POST_SYNC_COMMAND_TIMEOUT_MS = 30_000;

const MAX_CAPTURED_OUTPUT_CHARS = 1000;

const MAX_FAILURE_DETAIL_CHARS = 120;

const REDACTED_PLACEHOLDER = "[REDACTED]";

export type TPostSyncCommandContext = {
  certificatePath?: string;
  commonName?: string;
  certificateDirectory: string;
  certificateFiles: string[];
  pkcs12Password?: string;
};

export type TPostSyncCommandResult = {
  status: PkiSyncStatus.Succeeded | PkiSyncStatus.Failed;
  exitCode?: number;
  durationMs: number;
  output?: string;
  failureDetail?: string;
  error?: string;
};

export type TPostSyncCommandExecutionResult = { stdout: string; stderr: string; exitCode: number };

export type TPostSyncCommandPlan = { command: string; context: TPostSyncCommandContext };

const POST_SYNC_COMMAND_KEY = "postSyncCommand";

export const normalizeNewPostSyncCommand = (syncOptions: Record<string, unknown>): Record<string, unknown> => {
  if (syncOptions[POST_SYNC_COMMAND_KEY]) return syncOptions;

  const normalized = { ...syncOptions };
  delete normalized[POST_SYNC_COMMAND_KEY];
  return normalized;
};

export const applyPostSyncCommandUpdate = (
  resolvedSyncOptions: Record<string, unknown>,
  storedCommand: unknown
): Record<string, unknown> => {
  const requested = resolvedSyncOptions[POST_SYNC_COMMAND_KEY];
  const next = { ...resolvedSyncOptions };

  const keep = requested === undefined ? storedCommand : requested;
  if (typeof keep === "string" && keep) {
    next[POST_SYNC_COMMAND_KEY] = keep;
  } else {
    delete next[POST_SYNC_COMMAND_KEY];
  }

  return next;
};

/**
 * Assembles what a post-sync command needs, or undefined when there is no command or the run
 * delivered nothing to activate.
 */
export const buildPostSyncCommandPlan = (args: {
  command?: string;
  destinationDirectory: string;
  deliveredPaths: Set<string>;
  deliveredCertificates: Array<{ path: string; commonName?: string }>;
  pkcs12Password?: string;
}): TPostSyncCommandPlan | undefined => {
  const { command, destinationDirectory, deliveredPaths, deliveredCertificates, pkcs12Password } = args;
  if (!command || deliveredCertificates.length === 0) return undefined;

  const singleCertificateVariables = findSingleCertificatePostSyncCommandVariables(command);
  if (deliveredCertificates.length > 1 && singleCertificateVariables.length > 0) {
    throw new PkiSyncError({
      message: `Post-sync command uses ${formatPostSyncCommandVariables(
        singleCertificateVariables
      )}. A variable that names one certificate cannot be resolved for a run that delivered ${
        deliveredCertificates.length
      } certificates. Unlink all but one certificate, or use {{certificateFiles}} instead.`,
      shouldRetry: false
    });
  }

  const onlyCertificate = deliveredCertificates.length === 1 ? deliveredCertificates[0] : undefined;

  return {
    command,
    context: {
      certificatePath: onlyCertificate?.path,
      commonName: onlyCertificate?.commonName,
      certificateDirectory: destinationDirectory,
      certificateFiles: Array.from(deliveredPaths),
      pkcs12Password
    }
  };
};

export const toPosixShellLiteral = (value: string): string => `'${value.split("'").join(`'\\''`)}'`;

export const toPowerShellLiteral = (value: string): string => `'${value.split("'").join("''")}'`;

/**
 * Renders the operator's template into the command that runs on the target.
 *
 * Each value is substituted as a quoted shell literal, so a common name carrying shell
 * metacharacters cannot break out and execute as code. The quoting is part of the substitution, so
 * the operator writes `{{certificatePath}}`, not `"{{certificatePath}}"`.
 *
 * Text that is not a documented variable is left as written, because other tools use the same braces
 * (helm, jq, Go templates). A plain scan rather than a template engine, so there is no helper,
 * subexpression or prototype path to evaluate.
 */
export const renderPostSyncCommand = (
  command: string,
  context: TPostSyncCommandContext,
  toShellLiteral: (value: string) => string
): string => {
  const values = new Map<PostSyncCommandVariable, string | undefined>([
    [PostSyncCommandVariable.CertificatePath, context.certificatePath],
    [PostSyncCommandVariable.CertificateDirectory, context.certificateDirectory],
    [PostSyncCommandVariable.CertificateFiles, context.certificateFiles.join("\n")],
    [PostSyncCommandVariable.CommonName, context.commonName],
    [PostSyncCommandVariable.Pkcs12Password, context.pkcs12Password]
  ]);

  return command.replace(VARIABLE_PATTERN, (match: string, name: string) =>
    isPostSyncCommandVariable(name) ? toShellLiteral(values.get(name) ?? "") : match
  );
};

const redactSecrets = (text: string, secrets: Array<string | undefined>): string =>
  secrets.reduce<string>((acc, secret) => (secret ? acc.split(secret).join(REDACTED_PLACEHOLDER) : acc), text);

const TRUNCATION_SUFFIX = "... (truncated)";

// A cut between the halves of a surrogate pair leaves a lone surrogate, which is not valid UTF-8.
const sliceWholeCharacters = (text: string, end: number): string => {
  const cut = text.slice(0, end);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
};

// The suffix counts against maxLength, so the cap bounds what actually gets stored.
const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength
    ? `${sliceWholeCharacters(text, Math.max(0, maxLength - TRUNCATION_SUFFIX.length))}${TRUNCATION_SUFFIX}`
    : text;

const firstNonEmptyLine = (text?: string): string | undefined =>
  text
    ?.split("\n")
    .map((line) => line.trim())
    .find(Boolean);

const captureOutput = (stdout: string, stderr: string): string | undefined => {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return combined ? truncate(combined, MAX_CAPTURED_OUTPUT_CHARS) : undefined;
};

/**
 * Runs the command through the caller's transport. Every failure mode (non-zero exit, timeout,
 * unreachable gateway) returns a Failed result instead of throwing, so the caller can fail the sync
 * while keeping the per-certificate delivery statuses it already recorded.
 */
export const runPostSyncCommand = async (args: {
  syncId: string;
  execute: () => Promise<TPostSyncCommandExecutionResult>;
  secretsToRedact?: Array<string | undefined>;
}): Promise<TPostSyncCommandResult> => {
  const { syncId, execute, secretsToRedact = [] } = args;
  const startedAt = Date.now();
  const redact = (text: string) => redactSecrets(text, secretsToRedact);

  try {
    const { stdout, stderr, exitCode } = await execute();
    const durationMs = Date.now() - startedAt;
    const output = captureOutput(redact(stdout), redact(stderr));

    if (exitCode === 0) {
      logger.info(`PKI sync post-sync command succeeded [syncId=${syncId}] [durationMs=${durationMs}]`);
      return { status: PkiSyncStatus.Succeeded, exitCode, durationMs, output };
    }

    logger.warn(
      `PKI sync post-sync command failed [syncId=${syncId}] [exitCode=${exitCode}] [durationMs=${durationMs}]`
    );
    const detail = firstNonEmptyLine(redact(stderr));
    return {
      status: PkiSyncStatus.Failed,
      exitCode,
      durationMs,
      output,
      failureDetail: detail ? truncate(detail, MAX_FAILURE_DETAIL_CHARS) : undefined,
      error: `Command exited with code ${exitCode}`
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const error = redact((err as Error)?.message ?? "Unknown error");
    logger.warn(`PKI sync post-sync command could not run [syncId=${syncId}] [durationMs=${durationMs}]: ${error}`);
    return { status: PkiSyncStatus.Failed, durationMs, error };
  }
};

/**
 * A short, single-line reason for pki_syncs.lastSyncMessage. The full output stays in the audit log.
 */
export const buildPostSyncCommandFailureMessage = (result: TPostSyncCommandResult): string => {
  const detail = result.failureDetail ?? firstNonEmptyLine(result.output);
  const prefix =
    result.exitCode === undefined ? "Post-sync command failed" : `Post-sync command failed (exit ${result.exitCode})`;

  if (detail) return `${prefix}: ${truncate(detail, MAX_FAILURE_DETAIL_CHARS)}`;
  return result.error ? `${prefix}: ${truncate(result.error, MAX_FAILURE_DETAIL_CHARS)}` : prefix;
};
