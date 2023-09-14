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

  const existingUnresolvedFingerprints: string[] = [];
  const batchRiskUpdate = [];

  const allRisksMarkedFalsePositive = await GitRisks.find({
    repositoryId: repository.id,
    status: RiskStatus.RESOLVED_FALSE_POSITIVE
  }).select("+hashedSecret").lean()

  const existingHashedSecretsWithStatusFalsePositive = allRisksMarkedFalsePositive.map(risk => risk.hashedSecret)
  const existingFingerprintsWithStatusFalsePositive = allRisksMarkedFalsePositive.map(risk => risk.fingerPrintWithoutCommitId)

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
          const hashSecret = sha512Hash.digest("hex");

          finding.Fingerprint = fingerPrintWithCommitId;
          finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId;
          finding.Commit = commit.id;
          finding.File = filepath;
          finding.Author = commit.author.name;
          finding.Email = commit?.author?.email ? commit?.author?.email : "";

          if (existingHashedSecretsWithStatusFalsePositive.includes(hashSecret) || existingFingerprintsWithStatusFalsePositive.includes(fingerPrintWithCommitId)) {
            batchRiskUpdate.push({
              fingerprint: finding.Fingerprint,
              data: {
                ...convertKeysToLowercase(finding),
                installationId: installationId,
                organization: organizationId,
                repositoryFullName: repository.fullName,
                repositoryId: repository.id,
                hashedSecret: hashSecret,
                status: RiskStatus.RESOLVED_FALSE_POSITIVE // set status to false positive
              },
            });
          } else {
            batchRiskUpdate.push({
              fingerprint: finding.Fingerprint,
              data: {
                ...convertKeysToLowercase(finding),
                installationId: installationId,
                organization: organizationId,
                repositoryFullName: repository.fullName,
                repositoryId: repository.id,
                hashedSecret: hashSecret,
                status: RiskStatus.UNRESOLVED // new risk so set to unresolved
              },
            });
          }
        }

      } catch (error) {
        done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
      }
    }
  }

  for (const { fingerprint, data } of batchRiskUpdate) {
    await GitRisks.findOneAndUpdate(
      { fingerprint },
      data,
      { upsert: true }
    ).lean();
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

  const totalUnresolvedRisks = batchRiskUpdate.filter(item => item.data.status === RiskStatus.UNRESOLVED).length

  if (totalUnresolvedRisks) {
    const subjectLine = `Incident alert: ${totalUnresolvedRisks} leaked secret(s) found in ${repository.fullName}`;
    await sendMail({
      template: "secretLeakIncident.handlebars",
      subjectLine,
      recipients: usersToNotify,
      substitutions: {
        numberOfUnresolvedSecrets: totalUnresolvedRisks,
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
        numberOfRisksFound: totalUnresolvedRisks, //  capture telemetry for new findings
      }
    });
  }

  done(null, { totalUnresolvedRisks, existingUnresolvedFingerprints })

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
