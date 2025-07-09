import { AxiosError } from "axios";
import { exec } from "child_process";
import RE2 from "re2";

import { readFindingsFile } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { BITBUCKET_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/bitbucket";
import { GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/github";
import { titleCaseToCamelCase } from "@app/lib/fn";

import { SecretScanningDataSource, SecretScanningFindingSeverity } from "./secret-scanning-v2-enums";
import { TCloneRepository, TGetFindingsPayload, TSecretScanningDataSourceListItem } from "./secret-scanning-v2-types";

const SECRET_SCANNING_SOURCE_LIST_OPTIONS: Record<SecretScanningDataSource, TSecretScanningDataSourceListItem> = {
  [SecretScanningDataSource.GitHub]: GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION,
  [SecretScanningDataSource.Bitbucket]: BITBUCKET_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION
};

export const listSecretScanningDataSourceOptions = () => {
  return Object.values(SECRET_SCANNING_SOURCE_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

export const cloneRepository = async ({ cloneUrl, repoPath }: TCloneRepository): Promise<void> => {
  const command = `git clone ${cloneUrl} ${repoPath} --bare`;
  return new Promise((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

export function scanDirectory(inputPath: string, outputPath: string, configPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `cd ${inputPath} && infisical scan --exit-code=77 -r "${outputPath}" ${configPath ? `-c ${configPath}` : ""}`;
    exec(command, (error) => {
      if (error && error.code !== 77) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
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

export const parseScanErrorMessage = (err: unknown): string => {
  let errorMessage: string;

  if (err instanceof AxiosError) {
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
