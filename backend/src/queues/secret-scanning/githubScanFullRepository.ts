import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import { GitRisks } from "../../ee/models";
import { MembershipOrg, User } from "../../models";
import { ADMIN } from "../../variables";
import { convertKeysToLowercase, scanFullRepoContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";

export const githubFullRepositorySecretScan = new Queue("github-full-repository-secret-scanning", "redis://redis:6379");

type TScanPushEventQueueDetails = {
  organizationId: string,
  installationId: string,
  repository: {
    id: number,
    fullName: string,
  },
}

githubFullRepositorySecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
  const { organizationId, repository, installationId }: TScanPushEventQueueDetails = job.data
  try {
    const octokit = new ProbotOctokit({
      auth: {
        appId: await getSecretScanningGitAppId(),
        privateKey: await getSecretScanningPrivateKey(),
        installationId: installationId
      },
    });

    const findings: SecretMatch[] = await scanFullRepoContentAndGetFindings(octokit, installationId as any, repository.fullName)
    for (const finding of findings) {
      await GitRisks.findOneAndUpdate({ fingerprint: finding.Fingerprint },
        {
          ...convertKeysToLowercase(finding),
          installationId: installationId,
          organization: organizationId,
          repositoryFullName: repository.fullName,
          repositoryId: repository.id
        }, {
        upsert: true
      }).lean()
    }

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

export const scanGithubFullRepoForSecretLeaks = (pushEventPayload: TScanPushEventQueueDetails) => {
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