import Queue, { Job } from "bull";
import { ProbotOctokit } from "probot"
import TelemetryService from "../../services/TelemetryService";
import { sendMail } from "../../helpers";
import GitRisks from "../../ee/models/gitRisks";
import { MembershipOrg, User } from "../../models";
import { ADMIN, OWNER } from "../../variables";
import { convertKeysToLowercase, scanFullRepoContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import { SecretMatch } from "../../ee/services/GithubSecretScanning/types";

export const githubFullRepositorySecretScan = new Queue("github-full-repository-secret-scanning", "redis://redis:6379");

type TScanPushEventQueueDetails = {
  organizationId: string,
  installationId: number, 
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
    const findings : SecretMatch[] = await scanFullRepoContentAndGetFindings(octokit, installationId, repository.fullName)
    for (const finding of findings) {
      await GitRisks.findOneAndUpdate({ fingerprint: finding.Fingerprint}, 
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
      $or: [
        { role: OWNER },
        { role: ADMIN }
      ]
    }).lean()

<<<<<<< HEAD
// githubFullRepositoryScan.process(async (job: Job, done: Queue.DoneCallback) => {
//   const { organizationId, repositories, installationId }: TScanFullRepositoryDetails = job.data
//   const repositoryFullNamesList = repositories ? repositories.map(repoDetails => repoDetails.full_name) : []
//   const octokit = new ProbotOctokit({
//     auth: {
//       appId: await getSecretScanningGitAppId(),
//       privateKey: await getSecretScanningPrivateKey(),
//       installationId: installationId
//     },
//   });
=======
    const userEmails = await User.find({
      _id: {
        $in: [adminsOfWork.map(orgMembership => orgMembership.user)]
      }
    }).select("email").lean()

    const usersToNotify = userEmails.map(userObject => userObject.email)
>>>>>>> origin

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

<<<<<<< HEAD
//     let page = 1;
//     while (true) {
//       // octokit.repos.getco
//       const { data } = await octokit.repos.listCommits({
//         owner,
//         repo,
//         per_page: 100,
//         page
//       });

//       await getFilesFromCommit(octokit, owner, repo, "646b386605177ed0a2cc0a596eeee0cf57666342")

//       page++;
//     }

//   }

//   done()

//   // const allFindingsByFingerprint: { [key: string]: SecretMatch; } = {}
//   // for (const commit of commits) {
//   //   for (const filepath of [...commit.added, ...commit.modified]) {
//   //     try {
//   //       const fileContentsResponse = await octokit.repos.getContent({
//   //         owner,
//   //         repo,
//   //         path: filepath,
//   //       });

//   //       const data: any = fileContentsResponse.data;
//   //       const fileContent = Buffer.from(data.content, "base64").toString();

//   //       const findings = await scanContentAndGetFindings(`\n${fileContent}`) // extra line to count lines correctly

//   //       for (const finding of findings) {
//   //         const fingerPrintWithCommitId = `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`
//   //         const fingerPrintWithoutCommitId = `${filepath}:${finding.RuleID}:${finding.StartLine}`
//   //         finding.Fingerprint = fingerPrintWithCommitId
//   //         finding.FingerPrintWithoutCommitId = fingerPrintWithoutCommitId
//   //         finding.Commit = commit.id
//   //         finding.File = filepath
//   //         finding.Author = commit.author.name
//   //         finding.Email = commit?.author?.email ? commit?.author?.email : ""

//   //         allFindingsByFingerprint[fingerPrintWithCommitId] = finding
//   //       }

//   //     } catch (error) {
//   //       done(new Error(`gitHubHistoricalScanning.process: unable to fetch content for [filepath=${filepath}] because [error=${error}]`), null)
//   //     }
//   //   }
//   // }

//   // // change to update
//   // for (const key in allFindingsByFingerprint) {
//   //   await GitRisks.findOneAndUpdate({ fingerprint: allFindingsByFingerprint[key].Fingerprint },
//   //     {
//   //       ...convertKeysToLowercase(allFindingsByFingerprint[key]),
//   //       installationId: installationId,
//   //       organization: organizationId,
//   //       repositoryFullName: repository.fullName,
//   //       repositoryId: repository.id
//   //     }, {
//   //     upsert: true
//   //   }).lean()
//   // }
//   // // get emails of admins
//   // const adminsOfWork = await MembershipOrg.find({
//   //   organization: organizationId,
//   //   $or: [
//   //     { role: OWNER },
//   //     { role: ADMIN }
//   //   ]
//   // }).lean()

//   // const userEmails = await User.find({
//   //   _id: {
//   //     $in: [adminsOfWork.map(orgMembership => orgMembership.user)]
//   //   }
//   // }).select("email").lean()

//   // const adminOrOwnerEmails = userEmails.map(userObject => userObject.email)

//   // const usersToNotify = pusher?.email ? [pusher.email, ...adminOrOwnerEmails] : [...adminOrOwnerEmails]
//   // if (Object.keys(allFindingsByFingerprint).length) {
//   //   await sendMail({
//   //     template: "secretLeakIncident.handlebars",
//   //     subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
//   //     recipients: usersToNotify,
//   //     substitutions: {
//   //       numberOfSecrets: Object.keys(allFindingsByFingerprint).length,
//   //       pusher_email: pusher.email,
//   //       pusher_name: pusher.name
//   //     }
//   //   });
//   // }

//   // const postHogClient = await TelemetryService.getPostHogClient();
//   // if (postHogClient) {
//   //   postHogClient.capture({
//   //     event: "cloud secret scan",
//   //     distinctId: pusher.email,
//   //     properties: {
//   //       numberOfCommitsScanned: commits.length,
//   //       numberOfRisksFound: Object.keys(allFindingsByFingerprint).length,
//   //     }
//   //   });
//   // }

//   // done(null, allFindingsByFingerprint)

// })

// export const scanGithubFullRepositoryForSecretLeaks = (scanFullRepositoryDetails: TScanFullRepositoryDetails) => {
//   console.log("full repo scan started")
//   githubFullRepositoryScan.add(scanFullRepositoryDetails)
// }
=======
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
>>>>>>> origin
