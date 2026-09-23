import { AxiosError } from "axios";
import { join } from "path";
import picomatch from "picomatch";
import RE2 from "re2";

import {
  execFileBounded,
  getGitThreadLimitArgs,
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
import { getConfig, SECRET_SCANNING_COMMIT_ENUMERATION_TIMEOUT } from "@app/lib/config/env";
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
  let output: string;

  try {
    output = await execFileBounded("git", ["count-objects", "-v"], {
      phase: SecretScanningExecPhase.Measure,
      cwd: repoPath,
      timeoutMs: 30_000
    });
  } catch (error) {
    // With the limit disabled the measurement is informational only (it feeds the scan log), so a
    // measurement failure must not fail a scan the operator explicitly chose not to bound. With the
    // limit enabled this is the enforcement backstop and stays fail-closed.
    if (!getConfig().SECRET_SCANNING_MAX_REPO_SIZE_MB) {
      logger.warn(
        error,
        `secretScanningV2: Repository measurement failed with the size limit disabled, continuing [resourceName=${resourceName}]`
      );
      return undefined;
    }

    throw error;
  }

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

  await execFileBounded("git", [...getGitThreadLimitArgs(), "clone", cloneUrl, repoPath, "--bare"], {
    phase: SecretScanningExecPhase.Clone,
    timeoutMs: getConfig().SECRET_SCANNING_CLONE_TIMEOUT,
    env: GIT_PROCESS_ENV
  });
};

/**
 * Commits are enumerated oldest-first and scanned in slices of that order, this list
 * of commits will be used to create the batches of commits for historical scans.
 */
const COMMIT_LIST_ARGS = ["rev-list", "--full-history", "HEAD"];

export type TCommitBatch = {
  /** Commits to skip in `git log`'s newest-first order before this batch begins. */
  skip: number;
  maxCount: number;
  /** The batch's newest commit, recorded as the scan's resume point once the batch completes. */
  lastCommit: string;
  /**
   * Digest of every commit up to and including `lastCommit`, recorded beside it so the next run can
   * tell if a new commit has crept into this batch and it needs to be rescanned. This prevents a history
   * change (rebase) to cause some commits to not be scanned.
   */
  prefixDigest: string;
};

const COMMIT_LOG_OPTS = COMMIT_LIST_ARGS.slice(1).join(" ");

const buildCommitBatchLogOpts = ({ skip, maxCount }: TCommitBatch) =>
  `${COMMIT_LOG_OPTS} --skip=${skip} --max-count=${maxCount}`;

/**
 * Batches are aligned on absolute position in the oldest-first ordering rather than on wherever the
 * previous run stopped, so a resumed scan lands on the same boundaries as an uninterrupted one even
 * if the batch size changed between runs. Overlap that alignment causes is harmless: findings are
 * upserted on their fingerprint, so rescanning a commit rewrites the same row.
 */
export const planCommitBatches = async ({
  repoPath,
  batchSize,
  resumeAfterCommit,
  resumeAfterCommitDigest
}: {
  repoPath: string;
  batchSize: number;
  resumeAfterCommit?: string | null;
  resumeAfterCommitDigest?: string | null;
}): Promise<{
  totalCommits: number;
  batches: TCommitBatch[];
  resumed: boolean;
}> => {
  const boundaries: { index: number; commit: string; prefixDigest: string }[] = [];
  let totalCommits = 0;
  let resumeIndex = -1;
  let resumePrefixDigest = "";
  let newestCommit = "";

  // prefixDigest is the hash that is regenerated on every commit and can be
  // recreated from history.
  // A -> B -> C will generate a hash based on the commit sha and we can verify it
  // if for some reason the history becomes: A -> B -> D -> C, when processing C
  // the digest doesn't match anymore and it means that we have some unscanned commit
  // in the history.
  const prefix = crypto.nativeCrypto.createHash("sha256");
  const prefixDigest = () => prefix.copy().digest("hex");

  await execFileBounded("git", [...COMMIT_LIST_ARGS, "--reverse"], {
    phase: SecretScanningExecPhase.Enumerate,
    cwd: repoPath,
    timeoutMs: SECRET_SCANNING_COMMIT_ENUMERATION_TIMEOUT,
    env: GIT_PROCESS_ENV,
    onStdoutLine: (line) => {
      const commit = line.trim();
      if (!commit) return;

      const index = totalCommits;
      totalCommits += 1;
      newestCommit = commit;
      prefix.update(commit);

      if (commit === resumeAfterCommit) {
        resumeIndex = index;
        resumePrefixDigest = prefixDigest();
      }
      if ((index + 1) % batchSize === 0) boundaries.push({ index, commit, prefixDigest: prefixDigest() });
    }
  });

  const lastIndex = totalCommits - 1;
  if (totalCommits && boundaries[boundaries.length - 1]?.index !== lastIndex) {
    boundaries.push({ index: lastIndex, commit: newestCommit, prefixDigest: prefixDigest() });
  }

  // If true, means that the history of commits have changed and there are unscanned commits
  // This should only happen if a worker dies and clone the repo again after a rebase.
  // If this happens, it means we can't continue and actually need to start over to ensure
  // all commits are scanned.
  const prefixChanged = resumeIndex >= 0 && resumePrefixDigest !== resumeAfterCommitDigest;
  const resumableIndex = prefixChanged ? -1 : resumeIndex;

  // Two ways a resume point stops meaning anything: a rewritten history (force push, or a rebase
  // landing between runs) takes the commit out of the repository entirely, or a newly reachable ref
  // puts commits ahead of it that this scan has never looked at. Either way the repository is
  // re-walked from the start rather than resumed past commits nobody scanned.
  if (resumeAfterCommit && resumableIndex < 0) {
    logger.warn(
      `secretScanningV2: Full Scan cannot resume, restarting [repoPath=${repoPath}] [lastScannedCommit=${resumeAfterCommit}] [reason=${prefixChanged ? "history before the resume point changed" : "resume point is no longer in the repository"}]`
    );
  }

  const batches = boundaries
    .map(({ index, commit, prefixDigest: boundaryPrefixDigest }, position) => ({
      index,
      skip: totalCommits - 1 - index,
      maxCount: index - position * batchSize + 1,
      lastCommit: commit,
      prefixDigest: boundaryPrefixDigest
    }))
    .filter(({ index }) => index > resumableIndex)
    .map(({ skip, maxCount, lastCommit, prefixDigest: boundaryPrefixDigest }) => ({
      skip,
      maxCount,
      lastCommit,
      prefixDigest: boundaryPrefixDigest
    }));

  return { totalCommits, batches, resumed: resumableIndex >= 0 };
};

export async function scanDirectory(
  inputPath: string,
  outputPath: string,
  configPath?: string,
  logOpts?: string
): Promise<void> {
  const args = ["scan", "--exit-code=77", "-r", outputPath];
  if (configPath) {
    args.push("-c", configPath);
  }
  if (logOpts) {
    args.push(`--log-opts=${logOpts}`);
  }

  await execFileBounded("infisical", args, {
    phase: SecretScanningExecPhase.Scan,
    cwd: inputPath,
    timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT,
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
      timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT,
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

export const toFindingDetails = (finding: SecretMatch): unknown =>
  titleCaseToCamelCase({
    ...finding,
    Link: finding.Link ?? finding.Attributes?.url ?? ""
  });

export const scanGitRepositoryAndGetFindings = async (
  scanPath: string,
  findingsPath: string,
  configPath?: string,
  batch?: TCommitBatch
): TGetFindingsPayload => {
  const logOpts = batch ? buildCommitBatchLogOpts(batch) : COMMIT_LOG_OPTS;
  await scanDirectory(scanPath, findingsPath, configPath, logOpts);

  const findingsData = JSON.parse(await readFindingsFile(findingsPath)) as SecretMatch[];

  return findingsData.map((finding) => ({
    details: toFindingDetails(finding),
    fingerprint: `${finding.Fingerprint}:${finding.StartColumn}`,
    severity: SecretScanningFindingSeverity.High,
    rule: finding.RuleID
  }));
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

// "10 minute time limit" for the defaults, "30 second time limit" for sub-minute ceilings, which
// would otherwise round to a nonsensical "0 minute time limit".
const formatTimeoutLimit = (timeoutMs: number) => {
  const minutes = Math.round(timeoutMs / 60_000);
  if (minutes >= 1) return `${minutes} minute`;
  return `${Math.max(1, Math.round(timeoutMs / 1_000))} second`;
};

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
    const limit = formatTimeoutLimit(err.timeoutMs ?? 0);
    return isClone
      ? `Cloning the repository exceeded the ${limit} time limit and was cancelled. The repository is likely too large to scan.`
      : `The scan exceeded the ${limit} time limit and was cancelled. The repository is likely too large to scan in full.`;
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
