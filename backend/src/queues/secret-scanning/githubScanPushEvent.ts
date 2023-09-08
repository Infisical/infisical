import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot";
import { Commit } from "@octokit/webhooks-types";
import { createHash } from "crypto";
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
import { convertKeysToLowercase, scanContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { checkIfInfisicalIgnoreFile } from "./checkInfisicalIgnoreFile";

export const githubPushEventSecretScan = new Queue("github-push-event-secret-scanning", "redis://redis:6379");

type TScanPushEventQueueDetails = {
  organizationId: string,
  commits: Commit[]
  pusher: {
    name: string,
    email: string | null
  },
  repository: {
    id: number,
    fullName: string,
  },
  installationId: number,
}

githubPushEventSecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
  const { organizationId, commits, pusher, repository, installationId }: TScanPushEventQueueDetails = job.data
  const [owner, repo] = repository.fullName.split("/");
  const octokit = new ProbotOctokit({
    auth: {
      appId: await getSecretScanningGitAppId(),
      privateKey: await getSecretScanningPrivateKey(),
      installationId: installationId
    },
  });

  // Scan the .infisicalignore file (if it exists) & extract the fingerprints
  const infisicalIgnoreFileContents = await checkIfInfisicalIgnoreFile(octokit, owner, repo);

  const newInfisicalIgnoreFindingsToUpdate: string[] = [];
  const existingUnresolvedFindings: number[] = [];
  const newFindingsToUpdate: any[] = [];

  for (const commit of commits) {
    for (const filepath of [...commit.added, ...commit.modified]) {
      try {
        const fileContentsResponse = await octokit.repos.getContent({
          owner,
          repo,
          path: filepath,
        });

        const data: any = fileContentsResponse.data;
        const fileContent = Buffer.from(data.content, "base64").toString();

        const findings = await scanContentAndGetFindings(`\n${fileContent}`); // extra line to count lines correctly
        const existingResolvedFingerprints: string[] = [];
        const hashedSecretFindings: string[] = [];

        for (const finding of findings) {
          const fingerPrintWithCommitId = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`;
          const fingerPrintWithoutCommitId = `${filepath}:${finding.RuleID}:${finding.StartLine}`;

          // Create a SHA3-512 hash of the secret & immediately clear the secret from memory
          let secret = finding.Secret;
          const sha512Hash = createHash("sha3-512");
          sha512Hash.update(secret);
          const hashResult = sha512Hash.digest("hex");
          secret = "";

          // check if the hashed secret has already been processed
          if(hashedSecretFindings.includes(hashResult)) {
            continue;
          }

          // Check if the hashed secret is in the same repository & bulk process if more than one
          // TODO: the user should be notified if the hashed secret is also in another part of the repo...
          const existingFindingsInFile = await GitRisks.find({
            $and: [
              { hashedSecret: hashResult },
              { repositoryId: repository.id },
            ]
          }).select("+hashedSecret")
        
          let unresolvedFindingsCount = 0;

          for (const existingFinding of existingFindingsInFile) {
            hashedSecretFindings.push(existingFinding.hashedSecret)

            // skip all resolved findings (false positives, revoked & unrevoked)
            if (existingFinding && existingFinding.status !== RiskStatus.UNRESOLVED) {
              existingResolvedFingerprints.push(existingFinding.fingerprint);
            } else if (existingFinding && existingFinding.status === RiskStatus.UNRESOLVED) {
              unresolvedFindingsCount += 1;
              existingUnresolvedFindings.push(unresolvedFindingsCount);
            }
          }

          if (existingFindingsInFile.length > 0) {
            continue;
          }

          finding.Fingerprint = fingerPrintWithCommitId;
          finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId;
          finding.Commit = commit.id;
          finding.File = filepath;
          finding.Author = commit.author.name;
          finding.Email = commit?.author?.email ? commit?.author?.email : "";

          newFindingsToUpdate.push({
            fingerprint: finding.Fingerprint,
            data: {
              ...convertKeysToLowercase(finding),
              installationId: installationId,
              organization: organizationId,
              repositoryFullName: repository.fullName,
              repositoryId: repository.id,
              hashedSecret: hashResult,
            },
          });
        }

        // check .infisicalignore file
        const ignoreFingerprints = [];

        for (const infisicalIgnoreFingerprint of infisicalIgnoreFileContents) {
          if (infisicalIgnoreFingerprint.exists) {
            const content = infisicalIgnoreFingerprint.content;
            if (content) {
              const fingerprints = content.split("\n");
              // Collect individual fingerprints in the array
              ignoreFingerprints.push(...fingerprints);
            }
          }
        }

        // Loop through unresolved existing fingerprints and .infisicalignore fingerprints to find matches
        for (const ignoreFingerprint of ignoreFingerprints) {
          for (const existingUnresolvedFingerprint of existingResolvedFingerprints)
            if (ignoreFingerprint === existingUnresolvedFingerprint) {
              // Collect to batch update as false positives
              newInfisicalIgnoreFindingsToUpdate.push(ignoreFingerprint)
            }
        }
        
      } catch (error) {
        done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
      }
    }
  }

  // batch update all new findings
  for (const { fingerprint, data } of newFindingsToUpdate) {
    await GitRisks.findOneAndUpdate(
      { fingerprint },
        data,
      { upsert: true }
    ).lean();
  }

  // batch update found .infisicalignore findings (to false positives) 
  // (Assumption: user flags these in .infisicalignore as false positives)
  for (const processedFingerprint of newInfisicalIgnoreFindingsToUpdate) {
    // Only update findings with fingerprints that matched
    if (newInfisicalIgnoreFindingsToUpdate.includes(processedFingerprint)) {
      await GitRisks.findOneAndUpdate(
        { fingerprint: processedFingerprint },
        { status: RiskStatus.RESOLVED_FALSE_POSITIVE },
        { upsert: true }
      ).lean();
    }
  }

  // get emails of admins
  const adminsOfWork = await MembershipOrg.find({
    organization: organizationId,
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

  const numberOfNewSecrets = newFindingsToUpdate.length;
  const numberOfUnresolvedSecrets = existingUnresolvedFindings.length;

  if (numberOfNewSecrets || numberOfUnresolvedSecrets) {
    let subjectLine = "Incident alert:";
    const messages = [];

    if (numberOfNewSecrets > 0) {
      messages.push(`${numberOfNewSecrets} new leaked ${numberOfNewSecrets === 1 ? "secret" : "secrets"}`);
    }

    if (numberOfUnresolvedSecrets > 0) {
      messages.push(`${numberOfUnresolvedSecrets} unresolved leaked ${numberOfUnresolvedSecrets === 1 ? "secret" : "secrets"}`);
    }

    if (messages.length > 0) {
      subjectLine += ` ${messages.join(" & ")} found in GitHub repository: ${repository.fullName}`;
      
      await sendMail({
        template: "secretLeakIncident.handlebars",
        subjectLine,
        recipients: usersToNotify,
        substitutions: {
          numberOfNewSecrets,
          numberOfUnresolvedSecrets,
          pusher_email: pusher.email,
          pusher_name: pusher.name
        }
      });
    }
  }

  const postHogClient = await TelemetryService.getPostHogClient();
  if (postHogClient) {
    postHogClient.capture({
      event: "cloud secret scan",
      distinctId: pusher.email,
      properties: {
        numberOfCommitsScanned: commits.length,
        numberOfRisksFound: numberOfNewSecrets, //  capture telemetry for new findings
      }
    });
  }

  done(null, {newFindingsToUpdate, existingUnresolvedFindings})

})

export const scanGithubPushEventForSecretLeaks = (pushEventPayload: TScanPushEventQueueDetails) => {
  githubPushEventSecretScan.add(pushEventPayload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: {
      count: 20 // keep the most recent 20 jobs
    }
  })
}