import { AxiosError } from "axios";
import { exec } from "child_process";

import { readFindingsFile } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION } from "@app/ee/services/secret-scanning-v2/github";

import { SecretScanningDataSource, SecretScanningFindingSeverity } from "./secret-scanning-v2-enums";
import { TCloneRepository, TGetFindingsPayload, TSecretScanningDataSourceListItem } from "./secret-scanning-v2-types";

const SECRET_SCANNING_SOURCE_LIST_OPTIONS: Record<SecretScanningDataSource, TSecretScanningDataSourceListItem> = {
  [SecretScanningDataSource.GitHub]: GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION
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

export function scanDirectory(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `cd ${inputPath} && infisical scan --exit-code=77 -r "${outputPath}"`;
    exec(command, (error) => {
      if (error && error.code !== 77) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export const titleCaseToCamelCase = (obj: unknown): unknown => {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item: object) => titleCaseToCamelCase(item));
  }

  const result: Record<string, unknown> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
      result[camelKey] = titleCaseToCamelCase((obj as Record<string, unknown>)[key]);
    }
  }

  return result;
};

export const scanGitRepositoryAndGetFindings = async (scanPath: string, findingsPath: string): TGetFindingsPayload => {
  await scanDirectory(scanPath, findingsPath);

  const findingsData = JSON.parse(await readFindingsFile(findingsPath)) as SecretMatch[];

  return findingsData.map(
    ({
      // discard match and secret as we don't want to store
      Match,
      Secret,
      ...finding
    }) => ({
      details: titleCaseToCamelCase(finding),
      fingerprint: finding.Fingerprint,
      severity: SecretScanningFindingSeverity.High,
      rule: finding.RuleID
    })
  );
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
