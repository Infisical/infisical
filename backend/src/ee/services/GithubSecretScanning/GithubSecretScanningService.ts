import { Probot } from "probot";
import { exec } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs";
import { tmpdir } from "os";
import { join } from "path"
import GitRisks from "../../models/gitRisks";
import GitAppOrganizationInstallation from "../../models/gitAppOrganizationInstallation";
import MembershipOrg from "../../../models/membershipOrg";
import { ADMIN, OWNER } from "../../../variables";
import User from "../../../models/user";
import { sendMail } from "../../../helpers";
import TelemetryService from "../../../services/TelemetryService";

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
  FingerPrintWithoutCommitId: string
};

export default async (app: Probot) => {
  app.on("installation.deleted", async (context) => {
    const { payload } = context;
    const { installation, repositories } = payload;
    if (installation.repository_selection == "all") {
      await GitRisks.deleteMany({ installationId: installation.id })
      await GitAppOrganizationInstallation.deleteOne({ installationId: installation.id })
    } else {
      if (repositories) {
        for (const repository of repositories) {
          await GitRisks.deleteMany({ repositoryId: repository.id })
        }
      }
    }
  })

  app.on("push", async (context) => {
    const { payload } = context;
    const { commits, repository, installation, pusher } = payload;
    const [owner, repo] = repository.full_name.split("/");

    if (!commits || !repository || !installation || !pusher) {
      return
    }

    const installationLinkToOrgExists = await GitAppOrganizationInstallation.findOne({ installationId: installation?.id }).lean()
    if (!installationLinkToOrgExists) {
      return
    }

    const allFindingsByFingerprint: { [key: string]: SecretMatch; } = {}

    for (const commit of commits) {
      for (const filepath of [...commit.added, ...commit.modified]) {
        try {
          const fileContentsResponse = await context.octokit.repos.getContent({
            owner,
            repo,
            path: filepath,
          });

          const data: any = fileContentsResponse.data;
          const fileContent = Buffer.from(data.content, "base64").toString();

          const findings = await scanContentAndGetFindings(`\n${fileContent}`) // extra line to count lines correctly

          for (const finding of findings) {
            const fingerPrintWithCommitId = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`
            const fingerPrintWithoutCommitId = `${filepath}:${finding.RuleID}:${finding.StartLine}`
            finding.Fingerprint = fingerPrintWithCommitId
            finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId
            finding.Commit = commit.id
            finding.File = filepath
            finding.Author = commit.author.name
            finding.Email = commit?.author?.email ? commit?.author?.email : ""

            allFindingsByFingerprint[fingerPrintWithCommitId] = finding
          }

        } catch (error) {
          console.error(`Error fetching content for ${filepath}`, error); // eslint-disable-line
        }
      }
    }

    // change to update
    for (const key in allFindingsByFingerprint) {
      const risk = await GitRisks.findOneAndUpdate({ fingerprint: allFindingsByFingerprint[key].Fingerprint },
        {
          ...convertKeysToLowercase(allFindingsByFingerprint[key]),
          installationId: installation.id,
          organization: installationLinkToOrgExists.organizationId,
          repositoryFullName: repository.full_name,
          repositoryId: repository.id
        }, {
        upsert: true
      }).lean()
    }
    // get emails of admins
    const adminsOfWork = await MembershipOrg.find({
      organization: installationLinkToOrgExists.organizationId,
      $or: [
        { role: OWNER },
        { role: ADMIN }
      ]
    }).lean()

    const userEmails = await User.find({
      _id: {
        $in: [adminsOfWork.map(orgMembership => orgMembership.user)]
      }
    }).select("email").lean()

    const adminOrOwnerEmails = userEmails.map(userObject => userObject.email)

    const usersToNotify = pusher?.email ? [pusher.email, ...adminOrOwnerEmails] : [...adminOrOwnerEmails]
    if (Object.keys(allFindingsByFingerprint).length) {
      await sendMail({
        template: "secretLeakIncident.handlebars",
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.full_name}`,
        recipients: usersToNotify,
        substitutions: {
          numberOfSecrets: Object.keys(allFindingsByFingerprint).length,
          pusher_email: pusher.email,
          pusher_name: pusher.name
        }
      });
    }

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "cloud secret scan",
        distinctId: pusher.email,
        properties: {
          numberOfCommitsScanned: commits.length,
          numberOfRisksFound: Object.keys(allFindingsByFingerprint).length,
        }
      });
    }
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

function convertKeysToLowercase<T>(obj: T): T {
  const convertedObj = {} as T;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowercaseKey = key.charAt(0).toLowerCase() + key.slice(1);
      convertedObj[lowercaseKey as keyof T] = obj[key];
    }
  }

  return convertedObj;
}