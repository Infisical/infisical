import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import { Commit } from "@octokit/webhooks-types";
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import { GitRisks } from "../../ee/models";
import { MembershipOrg, User } from "../../models";
import { ADMIN } from "../../variables";
import { convertKeysToLowercase, scanContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";

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
  installationId: number
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

  const allFindingsByFingerprint: { [key: string]: SecretMatch; } = {}

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

        const findings = await scanContentAndGetFindings(`\n${fileContent}`) // extra line to count lines correctly

        for (const finding of findings) {
          const fingerPrintWithCommitId = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`
          const fingerPrintWithoutCommitId = `${filepath}:${finding.RuleID}:${finding.StartLine}`
          finding.Fingerprint = fingerPrintWithCommitId
          finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId
          finding.Commit = commit.id
          finding.File = filepath
          finding.Author = commit.author.name
          finding.Email = commit?.author?.email ? commit?.author?.email : ""

          allFindingsByFingerprint[fingerPrintWithCommitId] = finding
        }

      } catch (error) {
        done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
      }
    }
  }

  // change to update
  for (const key in allFindingsByFingerprint) {
    await GitRisks.findOneAndUpdate({ fingerprint: allFindingsByFingerprint[key].Fingerprint },
      {
        ...convertKeysToLowercase(allFindingsByFingerprint[key]),
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
    role: ADMIN
  }).lean()

  const userEmails = await User.find({
    _id: {
      $in: [adminsOfWork.map(orgMembership => orgMembership.user)]
    }
  }).select("email").lean()

  const adminOrOwnerEmails = userEmails.map(userObject => userObject.email)

  const usersToNotify = pusher?.email ? [pusher.email, ...adminOrOwnerEmails] : [...adminOrOwnerEmails]
  if (Object.keys(allFindingsByFingerprint).length) {
    await sendMail({
      template: "secretLeakIncident.handlebars",
      subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
      recipients: usersToNotify,
      substitutions: {
        numberOfSecrets: Object.keys(allFindingsByFingerprint).length,
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
        numberOfRisksFound: Object.keys(allFindingsByFingerprint).length,
      }
    });
  }

  done(null, allFindingsByFingerprint)

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

