import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import { createHash } from "crypto";
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
import { convertKeysToLowercase, scanFullRepoContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";
import { checkIfInfisicalIgnoreFile } from "./checkInfisicalIgnoreFile";
import { TScanFullRepoQueueDetails } from "./types";

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

    // Scan the .infisicalignore file (if it exists) & extract the fingerprints
    const infisicalIgnoreFileContents = await checkIfInfisicalIgnoreFile(octokit, owner, repo);
    const batchUpdateOperations: any[] = [];
    const findings : SecretMatch[] = await scanFullRepoContentAndGetFindings(octokit, installationId, repository.fullName)

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

    // check .infisicalignore file

    const newInfisicalIgnoreFindingsToUpdate: any[] = [];

    for (const infisicalIgnoreFingerprint of infisicalIgnoreFileContents) {
      if (infisicalIgnoreFingerprint.exists) {
        const content = infisicalIgnoreFingerprint.content;
        if (content) {
          const fingerprints = content.split("\n");
          newInfisicalIgnoreFindingsToUpdate.push(...fingerprints);
        }
      }
    }

    // batch update found .infisicalignore findings (to false positives)
    for (const processedFingerprint of newInfisicalIgnoreFindingsToUpdate) {
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

    const usersToNotify = userEmails.map(userObject => userObject.email)

    if (findings.length) {
      await sendMail({
        template: "historicalSecretLeakIncident.handlebars",
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
        recipients: usersToNotify,
        substitutions: {
          numberOfSecrets: findings.length,
        }
      });
    }

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "historical cloud secret scan",
        distinctId: repository.fullName,
        properties: {
          numberOfRisksFound: findings.length,
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