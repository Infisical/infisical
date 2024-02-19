import { Octokit } from "@octokit/rest";
import { exec } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { SecretMatch } from "./secret-scanning-queue-types";

export function createTempFolder(): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = tmpdir();
    const tempFolderName = Math.random().toString(36).substring(2);
    const tempFolderPath = join(tempDir, tempFolderName);

    mkdir(tempFolderPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(tempFolderPath);
      }
    });
  });
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
}

export function runInfisicalScanOnRepo(repoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `cd ${repoPath} && infisical scan --exit-code=77 -r "${outputPath}"`;
    exec(command, (error) => {
      if (error && error.code !== 77) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export function runInfisicalScan(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `cat "${inputPath}" | infisical scan --exit-code=77 --pipe -r "${outputPath}"`;
    exec(command, (error) => {
      if (error && error.code !== 77) {
        reject(error);
      } else {
        resolve();
      }
    });
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

export async function scanContentAndGetFindings(textContent: string): Promise<SecretMatch[]> {
  const tempFolder = await createTempFolder();
  const filePath = join(tempFolder, "content.txt");
  const findingsPath = join(tempFolder, "findings.json");

  try {
    await writeTextToFile(filePath, textContent);
    await runInfisicalScan(filePath, findingsPath);
    const findingsData = await readFindingsFile(findingsPath);
    return JSON.parse(findingsData) as SecretMatch[];
  } finally {
    await deleteTempFolder(tempFolder);
  }
}
