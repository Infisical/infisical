import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import { Schema } from "mongoose";

import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN } from "../../variables";
import { convertKeysToLowercase, scanFullRepoContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";
import { BatchRiskUpdateItem, TScanFullRepoQueueDetails } from "./types";
import { SecretScanningService } from "../../services";
import { bulkWriteRiskData } from "./bulkWriteHelper";

export const githubFullRepositorySecretScan = new Queue("github-full-repository-secret-scanning", "redis://redis:6379");

githubFullRepositorySecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
  const {
    organizationId,
    repository,
    installationId,
    salt
  }: TScanFullRepoQueueDetails = job.data;
  const [owner, repo] = repository.fullName.split("/");

  try {
    const octokit = new ProbotOctokit({
      auth: {
        appId: await getSecretScanningGitAppId(),
        privateKey: await getSecretScanningPrivateKey(),
        installationId: installationId,
      },
    });

    const findings: SecretMatch[] = await scanFullRepoContentAndGetFindings(octokit, installationId, repository.fullName)
    const batchRiskUpdate: BatchRiskUpdateItem[] = [];
    const secretFindings: string[] = [];

    for (const finding of findings) {
      batchRiskUpdate.push({
        fingerprint: finding.Fingerprint,
        data: {
          ...convertKeysToLowercase(finding),
          installationId: installationId,
          organization: organizationId as unknown as Schema.Types.ObjectId,
          repositoryFullName: repository.fullName,
          repositoryId: repository.id.toString(),
          status: RiskStatus.UNRESOLVED,
          gitSecretBlindIndex: "", // placeholder until we create the blind indexes in bulk
        },
      })
      secretFindings.push(finding.Secret);
    }

    if (batchRiskUpdate.length === 0) return;

    // setup blind indexing for the Git secret findings
    const gitSecretBlindIndexes = await SecretScanningService.createGitSecrets({
      gitSecrets: secretFindings,
      organizationId,
      salt,
      status: RiskStatus.UNRESOLVED
    })

    if (findings.length !== gitSecretBlindIndexes.length) {
      throw new Error("Length mismatch between the Git secret findings and the new Git secret blind indexes");
    }

    // update the batch update operation with the corresponding gitSecretBlindIndex 
    // this is needed to coordinate Git risk status updates across GitRisks and GitSecret
    for (let i = 0; i < findings.length; i++) {
      batchRiskUpdate[i].data.gitSecretBlindIndex = gitSecretBlindIndexes[i];
    }
    
    // check for duplicate data and bulk update Git risks
    await bulkWriteRiskData(batchRiskUpdate);

    // get emails of admins
    const adminsOfWork = await MembershipOrg.find({
      organization: organizationId,
      role: ADMIN,
    }).lean()

    const userEmails = await User.find({
      _id: {
        $in: [adminsOfWork.map(orgMembership => orgMembership.user)]
      }
    }).select("email").lean()

    const usersToNotify = userEmails.map(userObject => userObject.email)
    const numberOfNewSecrets = findings.length

    if (findings.length) {
      await sendMail({
        template: "historicalSecretLeakIncident.handlebars",
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
        recipients: usersToNotify,
        substitutions: {
          numberOfSecrets: numberOfNewSecrets, // don't notify if secrets were marked in .infisicalignore file
        }
      });
    }

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "historical cloud secret scan",
        distinctId: repository.fullName,
        properties: {
          numberOfRisksFound: numberOfNewSecrets, // only capture telemetry for new secrets
        }
      });
    }
    done(null, findings)
  } catch (error) {
    done(new Error(`gitHubHistoricalScanning.process: an error occurred ${error}`), null)
  }
})

export const scanGithubFullRepoForSecretLeaks = (pushEventPayload: TScanFullRepoQueueDetails) => {
  githubFullRepositorySecretScan.add(pushEventPayload, {
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