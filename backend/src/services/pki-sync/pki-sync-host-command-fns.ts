import RE2 from "re2";

import { logger } from "@app/lib/logger";

import { PkiSyncStatus } from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";

export enum HostCommandKind {
  Preflight = "preflight check",
  PostSync = "post-sync command"
}

export const HOST_COMMAND_TIMEOUT_MS: Record<HostCommandKind, number> = {
  [HostCommandKind.Preflight]: 10_000,
  [HostCommandKind.PostSync]: 30_000
};

export enum HostCommandVariable {
  CertificatePath = "certificatePath",
  CertificateDirectory = "certificateDirectory",
  CertificateFiles = "certificateFiles",
  CommonName = "commonName",
  Pkcs12Password = "pkcs12Password"
}

const SINGLE_CERTIFICATE_HOST_COMMAND_VARIABLES: HostCommandVariable[] = [
  HostCommandVariable.CertificatePath,
  HostCommandVariable.CommonName
];

export type THostCommandContext = {
  certificatePath?: string;
  commonName?: string;
  certificateDirectory: string;
  certificateFiles: string[];
  pkcs12Password?: string;
};

export type THostCommandCertificate = { paths: string[]; commonName?: string };

export const HOST_COMMAND_MAX_LENGTH = 8192;

const VARIABLE_PATTERN = new RE2("\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", "g");

const MAX_CAPTURED_OUTPUT_CHARS = 1000;

const MAX_FAILURE_DETAIL_CHARS = 120;

const REDACTED_PLACEHOLDER = "[REDACTED]";

const DEADLINE_GRACE_MS = 5_000;

const sentenceCase = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export type THostCommandResult = {
  status: PkiSyncStatus.Succeeded | PkiSyncStatus.Failed;
  exitCode?: number;
  durationMs: number;
  output?: string;
  failureDetail?: string;
  error?: string;
};

export type THostCommandExecutionResult = { stdout: string; stderr: string; exitCode: number };

const findHostCommandVariables = (command?: string): Set<string> => {
  const used = new Set<string>();
  if (!command) return used;

  command.replace(VARIABLE_PATTERN, (match: string, name: string) => {
    used.add(name);
    return match;
  });

  return used;
};

export const toPosixShellLiteral = (value: string): string => `'${value.split("'").join(`'\\''`)}'`;

export const toPowerShellLiteral = (value: string): string => `'${value.split("'").join("''")}'`;

export const formatHostCommandVariables = (variables: string[]): string =>
  variables.map((variable) => `{{${variable}}}`).join(", ");

const CERTIFICATE_DEPENDENT_HOST_COMMAND_VARIABLES: HostCommandVariable[] = [
  HostCommandVariable.CertificatePath,
  HostCommandVariable.CertificateFiles,
  HostCommandVariable.CommonName
];

export const commandNeedsCertificateData = (command?: string): boolean => {
  const used = findHostCommandVariables(command);
  return CERTIFICATE_DEPENDENT_HOST_COMMAND_VARIABLES.some((variable) => used.has(variable));
};

export const findSingleCertificateHostCommandVariables = (command?: string): HostCommandVariable[] => {
  const used = findHostCommandVariables(command);
  return SINGLE_CERTIFICATE_HOST_COMMAND_VARIABLES.filter((variable) => used.has(variable));
};

export const buildHostCommandContext = (args: {
  kind: HostCommandKind;
  command: string;
  destinationDirectory: string;
  certificates: THostCommandCertificate[];
  certificateFiles?: string[];
  pkcs12Password?: string;
}): THostCommandContext => {
  const { kind, command, destinationDirectory, certificates, certificateFiles, pkcs12Password } = args;

  const singleCertificateVariables = findSingleCertificateHostCommandVariables(command);
  if (certificates.length > 1 && singleCertificateVariables.length > 0) {
    const delivered = kind === HostCommandKind.Preflight ? "would deliver" : "delivered";
    throw new PkiSyncError({
      message: `${sentenceCase(kind)} uses ${formatHostCommandVariables(
        singleCertificateVariables
      )}. A variable that names one certificate cannot be resolved for a run that ${delivered} ${
        certificates.length
      } certificates. Unlink all but one certificate, or use {{certificateFiles}} instead.`,
      shouldRetry: false
    });
  }

  const onlyCertificate = certificates.length === 1 ? certificates[0] : undefined;

  return {
    certificatePath: onlyCertificate?.paths[0],
    commonName: onlyCertificate?.commonName,
    certificateDirectory: destinationDirectory,
    certificateFiles: certificateFiles ?? certificates.flatMap((certificate) => certificate.paths),
    pkcs12Password
  };
};

const renderHostCommand = (
  command: string,
  values: Map<string, string | undefined>,
  toShellLiteral: (value: string) => string
): string =>
  command.replace(VARIABLE_PATTERN, (match: string, name: string) =>
    values.has(name) ? toShellLiteral(values.get(name) ?? "") : match
  );

export const renderHostCommandContext = (
  command: string,
  context: THostCommandContext,
  toShellLiteral: (value: string) => string
): string =>
  renderHostCommand(
    command,
    new Map<string, string | undefined>([
      [HostCommandVariable.CertificatePath, context.certificatePath],
      [HostCommandVariable.CertificateDirectory, context.certificateDirectory],
      [HostCommandVariable.CertificateFiles, context.certificateFiles.join("\n")],
      [HostCommandVariable.CommonName, context.commonName],
      [HostCommandVariable.Pkcs12Password, context.pkcs12Password]
    ]),
    toShellLiteral
  );

export const normalizeNewHostCommandOption = (
  syncOptions: Record<string, unknown>,
  optionKey: string
): Record<string, unknown> => {
  if (syncOptions[optionKey]) return syncOptions;

  const normalized = { ...syncOptions };
  delete normalized[optionKey];
  return normalized;
};

export const applyHostCommandOptionUpdate = (
  resolvedSyncOptions: Record<string, unknown>,
  optionKey: string,
  storedCommand: unknown
): Record<string, unknown> => {
  const requested = resolvedSyncOptions[optionKey];
  const next = { ...resolvedSyncOptions };

  const keep = requested === undefined ? storedCommand : requested;
  if (typeof keep === "string" && keep) {
    next[optionKey] = keep;
  } else {
    delete next[optionKey];
  }

  return next;
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

const withHostCommandDeadline = <T>(execute: () => Promise<T>, timeoutMs: number, graceMs: number): Promise<T> => {
  let timer: NodeJS.Timeout;

  return Promise.race([
    execute(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`command timed out after ${timeoutMs / 1000}s`)), timeoutMs + graceMs);
    })
  ]).finally(() => clearTimeout(timer));
};

export const runHostCommand = async (args: {
  kind: HostCommandKind;
  syncId: string;
  execute: () => Promise<THostCommandExecutionResult>;
  secretsToRedact?: Array<string | undefined>;
}): Promise<THostCommandResult> => {
  const { kind, syncId, execute, secretsToRedact = [] } = args;
  const timeoutMs = HOST_COMMAND_TIMEOUT_MS[kind];
  const startedAt = Date.now();
  const redact = (text: string) => redactSecrets(text, secretsToRedact);

  try {
    const { stdout, stderr, exitCode } = await withHostCommandDeadline(execute, timeoutMs, DEADLINE_GRACE_MS);
    const durationMs = Date.now() - startedAt;
    const output = captureOutput(redact(stdout), redact(stderr));

    if (exitCode === 0) {
      logger.info(`PKI sync ${kind} succeeded [syncId=${syncId}] [durationMs=${durationMs}]`);
      return { status: PkiSyncStatus.Succeeded, exitCode, durationMs, output };
    }

    logger.warn(`PKI sync ${kind} failed [syncId=${syncId}] [exitCode=${exitCode}] [durationMs=${durationMs}]`);
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
    logger.warn(`PKI sync ${kind} could not run [syncId=${syncId}] [durationMs=${durationMs}]: ${error}`);
    return { status: PkiSyncStatus.Failed, durationMs, error };
  }
};

export const hostCommandMessageSubject = (kind: HostCommandKind): string => sentenceCase(kind);

export const buildHostCommandFailureMessage = (
  kind: HostCommandKind,
  result: THostCommandResult,
  subject: string = hostCommandMessageSubject(kind)
): string => {
  const detail = result.failureDetail ?? firstNonEmptyLine(result.output);

  if (result.exitCode === undefined) {
    return `${subject} could not run: the destination host could not be reached`;
  }

  const prefix = `${subject} failed (exit ${result.exitCode})`;
  return detail ? `${prefix}: ${truncate(detail, MAX_FAILURE_DETAIL_CHARS)}` : prefix;
};
