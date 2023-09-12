import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import { createHash } from "crypto";

import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
import { convertKeysToLowercase, scanFullRepoContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";

import { TScanFullRepoQueueDetails } from "./types";
import { scanAndProcessInfisicalIgnoreFile } from "./scanAndProcessInfisicalIgnoreFile";

export const githubFullRepositorySecretScan = new Queue("github-full-repository-secret-scanning", "redis://redis:6379");

  githubFullRepositorySecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
    const {
    organizationId,
    repository,
    installationId
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

    const findings : SecretMatch[] = await scanFullRepoContentAndGetFindings(octokit, installationId, repository.fullName)
    const batchUpdateOperations: any[] = [];

    for (const finding of findings) {

      // Create a SHA3-512 hash of the secret (used for new pushes to more efficiently check repo)
      const sha512Hash = createHash("sha3-512");
      sha512Hash.update(finding.Secret);
      const hashResult = sha512Hash.digest("hex");
      
      const updateOperation = {
        updateOne: {
          filter: { fingerprint: finding.Fingerprint },
          update: {
            ...convertKeysToLowercase(finding),
            installationId: installationId,
            organization: organizationId,
            repositoryFullName: repository.fullName,
            repositoryId: repository.id,
            hashedSecret: hashResult,
          },
          upsert: true,
        },
      };

      batchUpdateOperations.push(updateOperation);
    }

    await GitRisks.bulkWrite(batchUpdateOperations);

    const processedInfisicalIgnoreCount = await scanAndProcessInfisicalIgnoreFile(octokit, owner, repo)

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

    const usersToNotify = userEmails.map(userObject => userObject.email)
    const numberOfNewSecrets = findings.length - processedInfisicalIgnoreCount

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