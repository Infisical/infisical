import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot";
import { createHash } from "crypto";

import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
import { convertKeysToLowercase, scanContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";

import { TScanPushEventQueueDetails } from "./types";
import { scanAndProcessInfisicalIgnoreFile } from "./scanAndProcessInfisicalIgnoreFile";

export const githubPushEventSecretScan = new Queue("github-push-event-secret-scanning", "redis://redis:6379");

  githubPushEventSecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
    const {
      organizationId,
      commits,
      pusher,
      repository,
      installationId
    }: TScanPushEventQueueDetails = job.data;

  const [owner, repo] = repository.fullName.split("/");
  const octokit = new ProbotOctokit({
    auth: {
      appId: await getSecretScanningGitAppId(),
      privateKey: await getSecretScanningPrivateKey(),
      installationId: installationId,
    },
  });

  const hashedSecretFindings: string[] = [];
  const existingUnresolvedFingerprints: string[] = [];
  const existingResolvedFingerprints: string[] = [];
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

        for (const finding of findings) {
          const fingerPrintWithCommitId = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`;
          const fingerPrintWithoutCommitId = `${filepath}:${finding.RuleID}:${finding.StartLine}`;

          // Create a SHA3-512 hash of the secret
          const sha512Hash = createHash("sha3-512");
          sha512Hash.update(finding.Secret);
          const hashResult = sha512Hash.digest("hex");

          // Check if the hashed secret has already been processed
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
        
          for (const existingFinding of existingFindingsInFile) {
            hashedSecretFindings.push(existingFinding.hashedSecret)

            // skip all resolved findings (false positives, revoked & unrevoked)
            if (existingFinding && existingFinding.status !== RiskStatus.UNRESOLVED) {
              existingResolvedFingerprints.push(existingFinding.fingerprint);
            } else if (existingFinding && existingFinding.status === RiskStatus.UNRESOLVED) {
              existingUnresolvedFingerprints.push(existingFinding.fingerprint);
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

  const processedInfisicalIgnoreCount = await scanAndProcessInfisicalIgnoreFile(octokit, owner, repo, existingUnresolvedFingerprints)

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
  const numberOfUnresolvedSecrets = existingUnresolvedFingerprints.length - processedInfisicalIgnoreCount;

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

  done(null, {newFindingsToUpdate, existingUnresolvedFingerprints})

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
