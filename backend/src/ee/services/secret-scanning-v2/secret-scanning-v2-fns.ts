import { AxiosError } from "axios";
import { join } from "path";
import picomatch from "picomatch";
import RE2 from "re2";

import {
  execFileBounded,
  getScannerProcessEnv,
  GIT_PROCESS_ENV,
  SecretScanningExecError,
  SecretScanningExecFailure,
  SecretScanningExecPhase
} from "@app/ee/services/secret-scanning/secret-scanning-exec";
import {
  createTempFolder,
  deleteTempFolder,
  readFindingsFile,
  writeTextToFile
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { BITBUCKET_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/bitbucket";
import { GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/github";
import { GITLAB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/gitlab";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { titleCaseToCamelCase } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { SecretScanningDataSource, SecretScanningFindingSeverity } from "./secret-scanning-v2-enums";
import { TCloneRepository, TGetFindingsPayload, TSecretScanningDataSourceListItem } from "./secret-scanning-v2-types";

const SECRET_SCANNING_SOURCE_LIST_OPTIONS: Record<SecretScanningDataSource, TSecretScanningDataSourceListItem> = {
  [SecretScanningDataSource.GitHub]: GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION,
  [SecretScanningDataSource.Bitbucket]: BITBUCKET_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION,
  [SecretScanningDataSource.GitLab]: GITLAB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION
};

export const listSecretScanningDataSourceOptions = () => {
  return Object.values(SECRET_SCANNING_SOURCE_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

// The scanner exits 77 when it wrote findings; that is a successful scan, not a failure.
const SCAN_FINDINGS_EXIT_CODE = 77;

const KIB_PER_MIB = 1024;

export class SecretScanningSizeLimitError extends Error {
  constructor(resourceName: string, sizeMb: number, limitMb: number) {
    super(`"${resourceName}" is ${sizeMb} MB, which exceeds the ${limitMb} MB scanning limit.`);
    this.name = "SecretScanningSizeLimitError";
  }
}

/**
 * Guards the clone, not just the scan: a bare clone of a large monorepo consumes network, wall clock
 * and ephemeral disk with no ceiling of its own. Providers report repository size in their metadata,
 * so this runs before any bytes are transferred. A size of `undefined` means the provider didn't
 * report one — `assertClonedRepositoryWithinSizeLimit` is the backstop for that case.
 */
export const assertRepositoryWithinSizeLimit = (resourceName: string, sizeMb: number | undefined) => {
  const { SECRET_SCANNING_MAX_REPO_SIZE_MB: limitMb } = getConfig();

  if (!limitMb || sizeMb === undefined) return;

  if (sizeMb > limitMb) throw new SecretScanningSizeLimitError(resourceName, sizeMb, limitMb);
};

const BYTES_PER_MB = 1024 * 1024;

/**
 * Reads a provider's reported repository size and applies the ceiling to it. The lookup is an
 * optimisation — `assertClonedRepositoryWithinSizeLimit` enforces the same ceiling once the clone
 * is on disk — so a rate-limited, forbidden or otherwise failing metadata call must never fail a
 * scan that would otherwise have run. A size the provider doesn't report is "unknown", not zero:
 * `null` (GitLab hides statistics from tokens without the privilege) must not read as 0 MB and
 * quietly pass the gate.
 */
export const assertProviderRepositorySizeWithinLimit = async (
  resourceName: string,
  readSizeBytes: () => Promise<number | string | null | undefined>
) => {
  let sizeBytes: number | string | null | undefined;

  try {
    sizeBytes = await readSizeBytes();
  } catch (error) {
    logger.warn(
      error,
      `secretScanningV2: Repository size lookup failed, deferring to the post-clone check [resourceName=${resourceName}]`
    );
    return;
  }

  if (sizeBytes === null || sizeBytes === undefined) return;

  const sizeMb = Math.round(Number(sizeBytes) / BYTES_PER_MB);

  assertRepositoryWithinSizeLimit(resourceName, Number.isNaN(sizeMb) ? undefined : sizeMb);
};

const SizePackRegex = new RE2(/^size-pack:\s*(\d+)/m);

/**
 * Measures a bare clone on disk and enforces the same ceiling. This is the backstop for providers
 * that don't report a size in their repository metadata, and doubles as the measurement logged with
 * each scan.
 */
export const assertClonedRepositoryWithinSizeLimit = async (resourceName: string, repoPath: string) => {
  const output = await execFileBounded("git", ["count-objects", "-v"], {
    phase: SecretScanningExecPhase.Measure,
    cwd: repoPath,
    timeoutMs: 30_000
  });

  const match = SizePackRegex.match(output);

  if (!match) return undefined;

  const sizeMb = Math.round(Number(match[1]) / KIB_PER_MIB);

  assertRepositoryWithinSizeLimit(resourceName, sizeMb);

  return sizeMb;
};

export const cloneRepository = async ({ cloneUrl, repoPath }: TCloneRepository): Promise<void> => {
  // Validate that the constructed URL is structurally valid.
  // This prevents malformed or tampered components from producing unexpected git behavior.
  // eslint-disable-next-line no-new
  new URL(cloneUrl);

  await execFileBounded("git", ["clone", cloneUrl, repoPath, "--bare"], {
    phase: SecretScanningExecPhase.Clone,
    timeoutMs: getConfig().SECRET_SCANNING_CLONE_TIMEOUT_MS,
    env: GIT_PROCESS_ENV
  });
};

export async function scanDirectory(inputPath: string, outputPath: string, configPath?: string): Promise<void> {
  const args = ["scan", "--exit-code=77", "-r", outputPath];
  if (configPath) {
    args.push("-c", configPath);
  }

  await execFileBounded("infisical", args, {
    phase: SecretScanningExecPhase.Scan,
    cwd: inputPath,
    timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT_MS,
    env: getScannerProcessEnv(),
    successExitCodes: [0, SCAN_FINDINGS_EXIT_CODE]
  });
}

export async function scanFile(inputPath: string, configPath?: string): Promise<void> {
  const args = ["scan", "--exit-code=77", "--source", inputPath, "--no-git"];
  if (configPath) {
    args.push("-c", configPath);
  }

  try {
    await execFileBounded("infisical", args, {
      phase: SecretScanningExecPhase.Scan,
      timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT_MS,
      env: getScannerProcessEnv(),
      successExitCodes: [0]
    });
  } catch (error) {
    // Only exit code 77 — a detected secret — is a violation. Every other failure mode fails open so
    // a scanner hiccup can't be reported to the caller as "secret detected" and block a write.
    if (error instanceof SecretScanningExecError && error.exitCode === SCAN_FINDINGS_EXIT_CODE) throw error;

    logger.warn(error, `scanFile: Secret detection scan did not complete [inputPath=${inputPath}]`);
  }
}

export const scanGitRepositoryAndGetFindings = async (
  scanPath: string,
  findingsPath: string,
  configPath?: string
): TGetFindingsPayload => {
  await scanDirectory(scanPath, findingsPath, configPath);

  const findingsData = JSON.parse(await readFindingsFile(findingsPath)) as SecretMatch[];

  return findingsData.map(
    ({
      // discard match and secret as we don't want to store
      Match,
      Secret,
      ...finding
    }) => ({
      details: titleCaseToCamelCase(finding),
      fingerprint: `${finding.Fingerprint}:${finding.StartColumn}`,
      severity: SecretScanningFindingSeverity.High,
      rule: finding.RuleID
    })
  );
};

export const replaceNonChangesWithNewlines = (patch: string) => {
  return patch
    .split("\n")
    .map((line) => {
      // Keep added lines (remove the + prefix)
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return line.substring(1);
      }

      // Replace everything else with newlines to maintain line positioning

      return "";
    })
    .join("\n");
};

const HunkHeaderRegex = new RE2(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);

export const convertPatchLineToFileLineNumber = (patch: string, patchLineNumber: number) => {
  const lines = patch.split("\n");
  let currentPatchLine = 0;
  let currentNewLine = 0;

  for (const line of lines) {
    currentPatchLine += 1;

    // Hunk header: @@ -a,b +c,d @@
    const hunkHeaderMatch = HunkHeaderRegex.match(line);
    if (hunkHeaderMatch) {
      const startLine = parseInt(hunkHeaderMatch[1], 10);
      currentNewLine = startLine;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (currentPatchLine === patchLineNumber) {
      return currentNewLine;
    }

    if (line.startsWith("+++")) {
      // eslint-disable-next-line no-continue
      continue; // skip file metadata lines
    }

    // Advance only if the line exists in the new file
    if (line.startsWith("+") || line.startsWith(" ")) {
      currentNewLine += 1;
    }
  }

  return currentNewLine;
};

const MAX_MESSAGE_LENGTH = 1024;

const GitAuthFailureRegex = new RE2(
  /authentication failed|could not read Username|invalid username or password|access denied|HTTP 40[13]/i
);
const GitNotFoundRegex = new RE2(/repository not found|remote: Not Found|does not appear to be a git repository/i);

/**
 * Maps a scan failure onto a message the customer can act on. Command lines and raw scanner/git
 * output never reach this return value — they stay in the logs attached to the original error.
 */
const parseExecErrorMessage = (err: SecretScanningExecError): string => {
  // The measurement runs `git count-objects` on an already-cloned repository, so none of the clone
  // advice below applies to it: there is no remote, no credentials and no customer-tunable timeout.
  if (err.phase === SecretScanningExecPhase.Measure) {
    return "The repository could not be measured before scanning.";
  }

  const isClone = err.phase === SecretScanningExecPhase.Clone;

  if (err.failure === SecretScanningExecFailure.Timeout) {
    const minutes = Math.round((err.timeoutMs ?? 0) / 60_000);
    return isClone
      ? `Cloning the repository exceeded the ${minutes} minute time limit and was cancelled. The repository is likely too large to scan.`
      : `The scan exceeded the ${minutes} minute time limit and was cancelled. The repository is likely too large to scan in full.`;
  }

  if (err.failure === SecretScanningExecFailure.Spawn) {
    return isClone ? "Git could not be started on this instance." : "The secret scanner could not be started.";
  }

  if (isClone) {
    if (GitAuthFailureRegex.test(err.output)) {
      return "Failed to clone the repository: the connection was denied access. Verify the connection's credentials and that it still has access to this repository.";
    }

    if (GitNotFoundRegex.test(err.output)) {
      return "Failed to clone the repository: it could not be found. Verify it still exists and that the connection has access to it.";
    }

    return "Failed to clone the repository. Verify the connection's credentials and that the repository is still accessible.";
  }

  return "The secret scanner exited unexpectedly.";
};

export const parseScanErrorMessage = (err: unknown): string => {
  let errorMessage: string;

  if (err instanceof SecretScanningExecError) {
    errorMessage = parseExecErrorMessage(err);
  } else if (err instanceof SecretScanningSizeLimitError) {
    errorMessage = err.message;
  } else if (err instanceof AxiosError) {
    errorMessage = err?.response?.data
      ? JSON.stringify(err?.response?.data)
      : (err?.message ?? "An unknown error occurred.");
  } else {
    errorMessage = (err as Error)?.message || "An unknown error occurred.";
  }

  return errorMessage.length <= MAX_MESSAGE_LENGTH
    ? errorMessage
    : `${errorMessage.substring(0, MAX_MESSAGE_LENGTH - 3)}...`;
};

const generateSecretValuePolicyConfiguration = (entropy: number): string => `
# Extend default configuration to preserve existing rules
[extend]
useDefault = true

# Add custom high-entropy rule
[[rules]]
id = "high-entropy"
description = "Will scan for high entropy secrets"
regex = '''.*'''
entropy = ${entropy}
keywords = []
`;

export const scanSecretPolicyViolations = async (
  projectId: string,
  secretPath: string,
  secrets: { secretKey: string; secretValue: string }[],
  ignoreValues: string[]
) => {
  const appCfg = getConfig();

  if (!appCfg.PARAMS_FOLDER_SECRET_DETECTION_ENABLED) {
    return;
  }

  const match = appCfg.PARAMS_FOLDER_SECRET_DETECTION_PATHS?.find(
    (el) => el.projectId === projectId && picomatch.isMatch(secretPath, el.secretPath, { strictSlashes: false })
  );

  if (!match) {
    return;
  }

  const tempFolder = await createTempFolder();
  try {
    const configPath = join(tempFolder, "infisical-scan.toml");

    const secretPolicyConfiguration = generateSecretValuePolicyConfiguration(
      appCfg.PARAMS_FOLDER_SECRET_DETECTION_ENTROPY
    );

    await writeTextToFile(configPath, secretPolicyConfiguration);

    const scanPromises = secrets
      .filter((secret) => !ignoreValues.includes(secret.secretValue))
      .map(async (secret) => {
        const secretKeyValueFilePath = join(tempFolder, `${crypto.nativeCrypto.randomUUID()}.txt`);
        const secretValueOnlyFilePath = join(tempFolder, `${crypto.nativeCrypto.randomUUID()}.txt`);
        await writeTextToFile(secretKeyValueFilePath, `${secret.secretKey}=${secret.secretValue}`);
        await writeTextToFile(secretValueOnlyFilePath, secret.secretValue);

        try {
          await scanFile(secretKeyValueFilePath);
          await scanFile(secretValueOnlyFilePath, configPath);
        } catch (error) {
          throw new BadRequestError({
            message: `Secret value detected in ${secret.secretKey}. Please add this instead to the designated secrets path in the project.`,
            name: "SecretPolicyViolation"
          });
        }
      });

    await Promise.all(scanPromises);
  } finally {
    await deleteTempFolder(tempFolder);
  }
};
