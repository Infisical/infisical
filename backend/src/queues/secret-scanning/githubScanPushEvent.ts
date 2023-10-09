import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot";
import { Schema } from "mongoose";

import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN } from "../../variables";
import { convertKeysToLowercase, scanContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { BatchRiskUpdateItem, TScanPushEventQueueDetails } from "./types";
import { SecretScanningService } from "../../services";
import { bulkWriteRiskData } from "./bulkWriteHelper";

export const githubPushEventSecretScan = new Queue("github-push-event-secret-scanning", "redis://redis:6379");

githubPushEventSecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
  const {
    organizationId,
    commits,
    pusher,
    repository,
    installationId,
    salt
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
  const batchRiskUpdate: BatchRiskUpdateItem[] = [];

  const updateGitSecretBlindIndexes = new Set<string>();
  const newGitSecretFindingsValues = new Set<string>();
  const newGitSecretBlindIndexes: string[] = [];

  const allRisksMarkedFalsePositive = await GitRisks.find({
    repositoryId: repository.id,
    status: RiskStatus.RESOLVED_FALSE_POSITIVE
  }).lean()

  const allGitSecretsMarkedFalsePositive = await SecretScanningService.getGitSecrets({ 
    organizationId,
    status: RiskStatus.RESOLVED_FALSE_POSITIVE
  })

  const existingFingerprintsWithStatusFalsePositive = allRisksMarkedFalsePositive.map(risk => risk.fingerPrintWithoutCommitId)
  const existingBlindIndexesWithStatusFalsePositive = allGitSecretsMarkedFalsePositive.map(gitSecret => gitSecret.gitSecretBlindIndex)

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

          finding.Fingerprint = fingerPrintWithCommitId;
          finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId;
          finding.Commit = commit.id;
          finding.File = filepath;
          finding.Author = commit.author.name;
          finding.Email = commit?.author?.email ? commit?.author?.email : "";

          const gitSecretBlindIndex = await SecretScanningService.createGitSecretBlindIndexWithSalt({ 
            salt,
            gitSecret: finding.Secret
          })

          if (existingBlindIndexesWithStatusFalsePositive.includes(gitSecretBlindIndex) || existingFingerprintsWithStatusFalsePositive.includes(fingerPrintWithCommitId)) {
            // can remove this if we don't want all new commits that still contain the fingerprints marked 
            // false positive to keep being added to GitRisks & the secret scanning logs table
            batchRiskUpdate.push({
              fingerprint: finding.Fingerprint,
              data: {
                ...convertKeysToLowercase(finding),
                installationId: installationId,
                organization: organizationId as unknown as Schema.Types.ObjectId,
                repositoryFullName: repository.fullName,
                repositoryId: repository.id.toString(),
                status: RiskStatus.RESOLVED_FALSE_POSITIVE, // set status to false positive
                gitSecretBlindIndex: gitSecretBlindIndex
              },
            });
            // same here + this causes the most recent risk status for that secret to be marked as false positive
            updateGitSecretBlindIndexes.add(gitSecretBlindIndex); // only want unique blind indexes here

          } else {
            batchRiskUpdate.push({
              fingerprint: finding.Fingerprint,
              data: {
                ...convertKeysToLowercase(finding),
                installationId: installationId,
                organization: organizationId as unknown as Schema.Types.ObjectId,
                repositoryFullName: repository.fullName,
                repositoryId: repository.id.toString(),
                status: RiskStatus.UNRESOLVED, // new risk so set to unresolved
                gitSecretBlindIndex: gitSecretBlindIndex
              },
            });

            newGitSecretFindingsValues.add(finding.Secret); // only need unique findings
            newGitSecretBlindIndexes.push(gitSecretBlindIndex); // process all so we can add against GitRisks
          }
        }
      } catch (error) {
        done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
      }
    }
  }

  if (!batchRiskUpdate?.length) return;

  // check for duplicate data and bulk update Git risks
  await bulkWriteRiskData(batchRiskUpdate);
  
  if (updateGitSecretBlindIndexes.size) {
    await SecretScanningService.updateGitSecrets({
      gitSecretBlindIndexes: Array.from(updateGitSecretBlindIndexes),
      organizationId,
      status: RiskStatus.RESOLVED_FALSE_POSITIVE // set status to false positive
    });
  }
    
  if (newGitSecretFindingsValues.size && newGitSecretBlindIndexes.length) {
    await SecretScanningService.createGitSecrets({
      gitSecrets: Array.from(newGitSecretFindingsValues),
      gitSecretBlindIndexes: newGitSecretBlindIndexes,
      organizationId,
      salt,
      status: RiskStatus.UNRESOLVED // new risk so set to unresolved
    });
  }

  // get emails of admins
  const adminsOfWork = await MembershipOrg.find({
    organization: organizationId,
    role: ADMIN
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

export const scanGithubPushEventForSecretLeaks = (payload: TScanPushEventQueueDetails) => {
  githubPushEventSecretScan.add(payload, {
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
