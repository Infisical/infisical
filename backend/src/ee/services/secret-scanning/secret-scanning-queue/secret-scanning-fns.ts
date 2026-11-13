import { Octokit } from "@octokit/rest";
import { readFile, rm, writeFile } from "fs";
import { mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";

import {
  execFileBounded,
  getGitThreadLimitArgs,
  getScannerProcessEnv,
  GIT_PROCESS_ENV,
  SecretScanningExecPhase
} from "@app/ee/services/secret-scanning/secret-scanning-exec";
import { getConfig } from "@app/lib/config/env";
import { chunkArray } from "@app/lib/fn/array";

import { SecretMatch } from "./secret-scanning-queue-types";

// The scanner exits 77 when it wrote findings; that is a successful scan, not a failure.
const SCAN_FINDINGS_EXIT_CODE = 77;
const SCAN_CONTENTS_WRITE_CONCURRENCY = 50;

export function createTempFolder(): Promise<string> {
  return mkdtemp(join(tmpdir(), "infisical-scan-"));
}

export function writeTextToFile(filePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    writeFile(filePath, content, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export async function cloneRepo(
  installationAcccessToken: string,
  repositoryFullName: string,
  repoPath: string
): Promise<void> {
  const cloneUrl = `https://x-access-token:${installationAcccessToken}@github.com/${repositoryFullName}.git`;

  // eslint-disable-next-line no-new
  new URL(cloneUrl);

  await execFileBounded("git", [...getGitThreadLimitArgs(), "clone", cloneUrl, repoPath, "--bare"], {
    phase: SecretScanningExecPhase.Clone,
    timeoutMs: getConfig().SECRET_SCANNING_CLONE_TIMEOUT,
    env: GIT_PROCESS_ENV
  });
}

export async function runInfisicalScanOnRepo(repoPath: string, outputPath: string): Promise<void> {
  await execFileBounded("infisical", ["scan", "--exit-code=77", "-r", outputPath], {
    phase: SecretScanningExecPhase.Scan,
    cwd: repoPath,
    timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT,
    env: getScannerProcessEnv(),
    successExitCodes: [0, SCAN_FINDINGS_EXIT_CODE]
  });
}

export async function runInfisicalScan(inputPath: string, outputPath: string, configPath?: string): Promise<void> {
  const args = ["scan", "--exit-code=77", "--source", inputPath, "--no-git", "-r", outputPath];
  if (configPath) {
    args.push("-c", configPath);
  }

  await execFileBounded("infisical", args, {
    phase: SecretScanningExecPhase.Scan,
    timeoutMs: getConfig().SECRET_SCANNING_SCAN_TIMEOUT,
    env: getScannerProcessEnv(),
    successExitCodes: [0, SCAN_FINDINGS_EXIT_CODE]
  });
}

export function readFindingsFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    readFile(filePath, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

export function deleteTempFolder(folderPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rm(folderPath, { recursive: true }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function convertKeysToLowercase<T>(obj: T): T {
  const convertedObj = {} as T;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowercaseKey = key.charAt(0).toLowerCase() + key.slice(1);
      convertedObj[lowercaseKey as keyof T] = obj[key];
    }
  }

  return convertedObj;
}

export async function scanFullRepoContentAndGetFindings(
  octokit: Octokit,
  installationId: string,
  repositoryFullName: string
): Promise<SecretMatch[]> {
  const tempFolder = await createTempFolder();
  const findingsPath = join(tempFolder, "findings.json");
  const repoPath = join(tempFolder, "repo.git");
  try {
    const {
      data: { token }
    } = await octokit.apps.createInstallationAccessToken({
      installation_id: Number(installationId)
    });
    await cloneRepo(token, repositoryFullName, repoPath);
    await runInfisicalScanOnRepo(repoPath, findingsPath);
    const findingsData = await readFindingsFile(findingsPath);
    return JSON.parse(findingsData) as SecretMatch[];
  } finally {
    await deleteTempFolder(tempFolder);
  }
}

export async function scanContentAndGetFindings(textContent: string, configPath?: string): Promise<SecretMatch[]> {
  const tempFolder = await createTempFolder();
  const filePath = join(tempFolder, "content.txt");
  const findingsPath = join(tempFolder, "findings.json");

  try {
    await writeTextToFile(filePath, textContent);
    await runInfisicalScan(filePath, findingsPath, configPath);
    const findingsData = await readFindingsFile(findingsPath);
    return JSON.parse(findingsData) as SecretMatch[];
  } finally {
    await deleteTempFolder(tempFolder);
  }
}

/**
 * Scans the content of every item with one scanner run, since starting the scanner costs far more than scanning a
 * patch. Each finding is returned with the item whose content it was found in.
 */
export async function scanContentsAndGetFindings<T>(
  items: T[],
  getContent: (item: T) => string,
  configPath?: string
): Promise<{ item: T; finding: SecretMatch }[]> {
  if (!items.length) return [];

  const tempFolder = await createTempFolder();
  const sourcePath = join(tempFolder, "contents");
  const findingsPath = join(tempFolder, "findings.json");

  try {
    await mkdir(sourcePath);

    // Each content is written under its item's index, which is how a finding's file is mapped back to its item.
    const indexes = items.map((_, index) => index);
    for (const chunk of chunkArray(indexes, SCAN_CONTENTS_WRITE_CONCURRENCY)) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        chunk.map((index) => writeTextToFile(join(sourcePath, String(index)), getContent(items[index])))
      );
    }

    await runInfisicalScan(sourcePath, findingsPath, configPath);
    const findings = JSON.parse(await readFindingsFile(findingsPath)) as SecretMatch[];

    return findings.map((finding) => {
      const index = Number(basename(finding.File));

      if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        throw new Error(`Scanner reported a finding in an unexpected file [file=${finding.File}]`);
      }

      return { item: items[index], finding };
    });
  } finally {
    await deleteTempFolder(tempFolder);
  }
}
