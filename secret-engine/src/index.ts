import { Probot } from "probot";
import { exec } from "child_process";
import { writeFile, readFile, rm, mkdir, } from "fs";
import { tmpdir } from "os";
import { join } from "path"
import mongoose from "mongoose";
import GitRisks, { STATUS_RESOLVED_FALSE_POSITIVE } from "./models/gitRisks";
import GitAppOrganizationInstallation from "./models/gitAppOrganizationInstallation";
import { sendMail, setTransporter } from "./helper/nodemailer";
import { initSmtp } from "./service/smtp";
import MembershipOrg, { ADMIN, OWNER } from "./models/membershipOrg";
import User from "./models/user";

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

export = async (app: Probot) => {
  // connect to DB
  initDatabase()

  setTransporter(await initSmtp());

  app.on("installation.created", async (context) => {
    const { payload } = context;
    // console.log("payload==>", payload.installation.repository_selection)
  })

  app.on("installation.deleted", async (context) => {
    const { payload } = context;
    const { installation, repositories } = payload;
    if (installation.repository_selection == "all") {
      await GitRisks.deleteMany({ installationId: installation.id })
      await GitAppOrganizationInstallation.deleteOne({ installationId: installation.id })
    } else {
      for (const repository of repositories) {
        await GitRisks.deleteMany({ repositoryId: repository.id })
      }
    }
  })

  app.on("push", async (context) => {
    const { payload } = context;
    const { commits, repository, installation, pusher } = payload;
    const [owner, repo] = repository.full_name.split('/');

    console.log(payload)
    const installationLinkToOrgExists = await GitAppOrganizationInstallation.findOne({ installationId: installation.id }).lean()
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
          const fileContent = Buffer.from(data.content, 'base64').toString();

          const findings = await scanContentAndGetFindings(`\n${fileContent}`) // to count lines correctly

          for (const finding of findings) {
            const fingerPrint = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`
            finding.Fingerprint = fingerPrint
            finding.Commit = commit.id
            finding.File = filepath
            finding.Author = commit.author.name
            finding.Email = commit.author.email
            allFindingsByFingerprint[fingerPrint] = finding
          }

        } catch (error) {
          console.error(`Error fetching content for ${filepath}`, error);
        }
      }
    }



    // change to update
    const noneFalsePositiveFindings = {}

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

      if (risk.status != STATUS_RESOLVED_FALSE_POSITIVE) {
        noneFalsePositiveFindings[key] = { ...convertKeysToLowercase(allFindingsByFingerprint[key]) }
      }

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


    // TODO
    // don't notify if the risk is marked as false positive

    await sendMail({
      template: "secretLeakIncident.handlebars",
      subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.full_name}`,
      recipients: [pusher.email, ...adminOrOwnerEmails],
      substitutions: {
        numberOfSecrets: Object.keys(allFindingsByFingerprint).length,
        pusher_email: pusher.email,
        pusher_name: pusher.name
      }
    });
  });

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
    const { payload } = context;
    const { pull_request } = payload
    if (false) {
      const check = {
        owner: pull_request.head.repo.owner.login,
        repo: pull_request.head.repo.name,
        name: 'Secret Detection',
        head_sha: pull_request.head.sha,
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: `X Secrets detected`,
          summary: 'We detected potential leaked secret(s) in your pull request.',
        },
      };
      return context.octokit.checks.create(check);
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

const initDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    // allow empty strings to pass the required validator
    mongoose.Schema.Types.String.checkRequired(v => typeof v === "string");

    console.log("Database connection established");

  } catch (err) {
    console.log(`Unable to establish Database connection due to the error.\n${err}`);
  }

  return mongoose.connection;
}

function convertKeysToLowercase<T>(obj: T): T {
  const convertedObj = {} as T;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowercaseKey = key.charAt(0).toLowerCase() + key.slice(1);
      convertedObj[lowercaseKey] = obj[key];
    }
  }

  return convertedObj;
}