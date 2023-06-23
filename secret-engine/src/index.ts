import { Probot } from "probot";
import { exec } from "child_process";
import { writeFile, readFile, rm, mkdir, } from "fs";
import { tmpdir } from "os";
import { join } from "path"

// interface CommandResult {
//   stdout: string;
//   stderr: string;
// }

type SecretMatch = {
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Match: string;
  Secret: string;
  File: string;
  SymlinkFile: string;
  Commit: string;
  Entropy: number;
  Author: string;
  Email: string;
  Date: string;
  Message: string;
  Tags: string[];
  RuleID: string;
  Fingerprint: string;
};

export = (app: Probot) => {
  app.on("pull_request", async (context) => {
    // create a check 
  })

  app.on("push", async (context) => {
    console.log("something was pushed")
    const { payload } = context;
    const { commits, repository } = payload;
    const [owner, repo] = repository.full_name.split('/');

    const fingerPrints: any = []
    for (const commit of commits) {
      for (const filepath of [...commit.added, ...commit.modified]) {
        try {
          const fileContentsResponse = await context.octokit.repos.getContent({
            owner,
            repo,
            path: filepath,
          });

          const data: any = fileContentsResponse.data;
          const fileContent = Buffer.from(data.content, 'base64').toString();

          const findings = await scanContentAndGetFindings(`\n${fileContent}`) // to count lines correctly

          for (const finding of findings) {
            fingerPrints.push(`${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`)
          }

        } catch (error) {
          console.error(`Error fetching content for ${filepath}`, error);
        }
      }
    }

    console.log("fingerPrints==>", fingerPrints)
  });
};

async function scanContentAndGetFindings(textContent: string): Promise<SecretMatch[]> {
  const tempFolder = await createTempFolder();
  const filePath = join(tempFolder, "content.txt");
  const findingsPath = join(tempFolder, "findings.json");

  try {
    await writeTextToFile(filePath, textContent);
    await runInfisicalScan(filePath, findingsPath);
    const findingsData = await readFindingsFile(findingsPath);
    return JSON.parse(findingsData);
  } finally {
    await deleteTempFolder(tempFolder);
  }
}

function createTempFolder(): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = tmpdir()
    const tempFolderName = Math.random().toString(36).substring(2);
    const tempFolderPath = join(tempDir, tempFolderName);

    mkdir(tempFolderPath, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(tempFolderPath);
      }
    });
  });
}

function writeTextToFile(filePath: string, content: string): Promise<void> {
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

function runInfisicalScan(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `cat "${inputPath}" | infisical scan --exit-code=77 --pipe -r "${outputPath}"`;
    exec(command, (error) => {
      if (error && error.code != 77) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function readFindingsFile(filePath: string): Promise<string> {
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

function deleteTempFolder(folderPath: string): Promise<void> {
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
