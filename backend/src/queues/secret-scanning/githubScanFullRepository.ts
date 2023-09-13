import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot";
import TelemetryService from "@app/services/TelemetryService";
import { sendMail } from "@app/helpers";
import GitRisks from "@app/ee/models/gitRisks";
import { MembershipOrg, User } from "@app/models";
import { ADMIN, OWNER } from "@app/variables";
import {
  convertKeysToLowercase,
  scanFullRepoContentAndGetFindings
} from "@app/ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "@app/config";
import { SecretMatch } from "@app/ee/services/GithubSecretScanning/types";

export const githubFullRepositorySecretScan = new Queue(
  "github-full-repository-secret-scanning",
  "redis://redis:6379"
);

type TScanPushEventQueueDetails = {
  organizationId: string;
  installationId: number;
  repository: {
    id: number;
    fullName: string;
  };
};

githubFullRepositorySecretScan.process(async (job: Job, done: Queue.DoneCallback) => {
  const { organizationId, repository, installationId }: TScanPushEventQueueDetails = job.data;
  try {
    const octokit = new ProbotOctokit({
      auth: {
        appId: await getSecretScanningGitAppId(),
        privateKey: await getSecretScanningPrivateKey(),
        installationId: installationId
      }
    });
    const findings: SecretMatch[] = await scanFullRepoContentAndGetFindings(
      octokit,
      installationId,
      repository.fullName
    );
    for (const finding of findings) {
      await GitRisks.findOneAndUpdate(
        { fingerprint: finding.Fingerprint },
        {
          ...convertKeysToLowercase(finding),
          installationId: installationId,
          organization: organizationId,
          repositoryFullName: repository.fullName,
          repositoryId: repository.id
        },
        {
          upsert: true
        }
      ).lean();
    }

    // get emails of admins
    const adminsOfWork = await MembershipOrg.find({
      organization: organizationId,
      $or: [{ role: OWNER }, { role: ADMIN }]
    }).lean();

    const userEmails = await User.find({
      _id: {
        $in: [adminsOfWork.map((orgMembership) => orgMembership.user)]
      }
    })
      .select("email")
      .lean();

    const usersToNotify = userEmails.map((userObject) => userObject.email);

    if (findings.length) {
      await sendMail({
        template: "historicalSecretLeakIncident.handlebars",
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
        recipients: usersToNotify,
        substitutions: {
          numberOfSecrets: findings.length
        }
      });
    }

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "historical cloud secret scan",
        distinctId: repository.fullName,
        properties: {
          numberOfRisksFound: findings.length
        }
      });
    }
    done(null, findings);
  } catch (error) {
    done(new Error(`gitHubHistoricalScanning.process: an error occurred ${error}`), null);
  }
});

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
  });
};
