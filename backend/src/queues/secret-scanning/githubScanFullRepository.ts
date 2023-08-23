// import Queue, { Job } from "bull";
// import { ProbotOctokit } from "probot"
// import { Commit, Committer, Repository } from "@octokit/webhooks-types";
// import TelemetryService from "../../services/TelemetryService";
// import { sendMail } from "../../helpers";
// import GitRisks from "../../ee/models/gitRisks";
// import { MembershipOrg, User } from "../../models";
// import { OWNER, ADMIN } from "../../variables";
// import { convertKeysToLowercase, getFilesFromCommit, scanContentAndGetFindings } from "../../ee/services/GithubSecretScanning/helper";
// import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";

// const githubFullRepositoryScan = new Queue('github-historical-secret-scanning', 'redis://redis:6379');

// type TScanFullRepositoryDetails = {
//   organizationId: string,
//   repositories: {
//     id: number;
//     node_id: string;
//     name: string;
//     full_name: string;
//     private: boolean;
//   }[] | undefined
//   installationId: number
// }

// type SecretMatch = {
//   Description: string;
//   StartLine: number;
//   EndLine: number;
//   StartColumn: number;
//   EndColumn: number;
//   Match: string;
//   Secret: string;
//   File: string;
//   SymlinkFile: string;
//   Commit: string;
//   Entropy: number;
//   Author: string;
//   Email: string;
//   Date: string;
//   Message: string;
//   Tags: string[];
//   RuleID: string;
//   Fingerprint: string;
//   FingerPrintWithoutCommitId: string
// };

// type Helllo = {
//   url: string;
//   sha: string;
//   node_id: string;
//   html_url: string;
//   comments_url: string;
//   commit: {
//     url: string;
//     author: {
//       name?: string | undefined;
//       email?: string | undefined;
//       date?: string | undefined;
//     } | null;
//     verification?: {
//     } | undefined;
//   };
//   files?: {}[] | undefined;
// }[]


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

//   for (const repositoryFullName of repositoryFullNamesList) {
//     const [owner, repo] = repositoryFullName.split("/");

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

