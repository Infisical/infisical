import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import { Commit } from "@octokit/webhooks-types";
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks, { RiskStatus } from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
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

  const uniqueFingerprints: string[] = [];
  const newFindingsByFingerprint: { [key: string]: SecretMatch; } = {}
  const existingUnresolvedFindingsByFingerprint: { [key: string]: SecretMatch; } = {}
  const existingUnrevokedFindingsByFingerprint: { [key: string]: SecretMatch; } = {}


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

          uniqueFingerprints.push(fingerPrintWithCommitId);
          newFindingsByFingerprint[fingerPrintWithCommitId] = finding;
        }
      } catch (error) {
        done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
      }
    }
  }

  const existingFindings = await GitRisks.find({
    fingerprint: { $in: uniqueFingerprints },
  });

  // Sort findings into risk status groups for: 
  // 1. user notification (new findings and exisiting unresolved & unrevoked findings)
  // 2. telemetry (new findings only)
  for (const existingFinding of existingFindings) {
    const fingerprint = existingFinding.fingerprint;

    // skip false positive & existing resolved (revoked) findings
    if (existingFinding.status === RiskStatus.RESOLVED_FALSE_POSITIVE || existingFinding.status === RiskStatus.RESOLVED_REVOKED) {
      continue;
    }

    if (existingFinding.status === RiskStatus.RESOLVED_NOT_REVOKED) {
      existingUnrevokedFindingsByFingerprint[fingerprint] = newFindingsByFingerprint[fingerprint];
    }

    if (existingFinding.status === RiskStatus.UNRESOLVED) {
      existingUnresolvedFindingsByFingerprint[fingerprint] = newFindingsByFingerprint[fingerprint];
    }
  }

  // change to update (only new findings)
  for (const key in newFindingsByFingerprint) {
    await GitRisks.findOneAndUpdate({ fingerprint: newFindingsByFingerprint[key].Fingerprint },
      {
        ...convertKeysToLowercase(newFindingsByFingerprint[key]),
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

  const numberOfNewSecrets = Object.keys(newFindingsByFingerprint).length;
  const numberOfUnresolvedSecrets = Object.keys(existingUnresolvedFindingsByFingerprint).length;
  const numberOfUnrevokedResolvedSecrets = Object.keys(existingUnrevokedFindingsByFingerprint).length;
  const numberOfTotalLeakedSecrets = numberOfNewSecrets + numberOfUnresolvedSecrets + numberOfUnrevokedResolvedSecrets;

  if (numberOfTotalLeakedSecrets) {
    let subjectLine = "Incident alert:";
    const messages = [];

    // keep subject line concise if one or more NEW secrets are detected
    if (numberOfNewSecrets > 0) {
      messages.push(`${numberOfNewSecrets} new leaked ${numberOfNewSecrets === 1 ? "secret" : "secrets"}`);
    }

    // otherwise be more specific
    if (numberOfUnresolvedSecrets > 0 && numberOfUnrevokedResolvedSecrets === 0) {
      messages.push(`${numberOfUnresolvedSecrets} unresolved leaked ${numberOfUnresolvedSecrets === 1 ? "secret" : "secrets"}`);
    }

    if (numberOfUnrevokedResolvedSecrets > 0 && numberOfUnresolvedSecrets === 0) {
      messages.push(`${numberOfUnrevokedResolvedSecrets} unrevoked leaked ${numberOfUnrevokedResolvedSecrets === 1 ? "secret" : "secrets"}`);
    }

    if (messages.length > 0) {
      subjectLine += ` ${messages.join(" & ")} found in Github repository ${repository.fullName}`;
      
      await sendMail({
        template: "secretLeakIncident.handlebars",
        subjectLine,
        recipients: usersToNotify,
        substitutions: {
          numberOfNewSecrets,
          numberOfUnresolvedSecrets,
          numberOfUnrevokedResolvedSecrets,
          numberOfTotalLeakedSecrets,
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
        numberOfRisksFound: Object.keys(newFindingsByFingerprint).length, // only capture telemetry for new findings
      }
    });
  }

  done(null, {uniqueFingerprints, newFindingsByFingerprint, existingUnresolvedFindingsByFingerprint, existingUnrevokedFindingsByFingerprint})

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

