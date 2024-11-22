import { ProbotOctokit } from "probot";

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { TSecretScanningDALFactory } from "../secret-scanning-dal";
import { scanContentAndGetFindings, scanFullRepoContentAndGetFindings } from "./secret-scanning-fns";
import { SecretMatch, TScanFullRepoEventPayload, TScanPushEventPayload } from "./secret-scanning-queue-types";

type TSecretScanningQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  secretScanningDAL: TSecretScanningDALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgMembershipDAL: Pick<TOrgDALFactory, "findMembership">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TSecretScanningQueueFactory = ReturnType<typeof secretScanningQueueFactory>;

export const secretScanningQueueFactory = ({
  queueService,
  secretScanningDAL,
  smtpService,
  telemetryService,
  orgMembershipDAL: orgMemberDAL
}: TSecretScanningQueueFactoryDep) => {
  const startFullRepoScan = async (payload: TScanFullRepoEventPayload) => {
    await queueService.queue(QueueName.SecretFullRepoScan, QueueJobs.SecretScan, payload, {
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

  const startPushEventScan = async (payload: TScanPushEventPayload) => {
    await queueService.queue(QueueName.SecretPushEventScan, QueueJobs.SecretScan, payload, {
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

  const getOrgAdminEmails = async (organizationId: string) => {
    // get emails of admins
    const adminsOfWork = await orgMemberDAL.findMembership({
      [`${TableName.Organization}.id` as string]: organizationId,
      role: OrgMembershipRole.Admin
    });
    return adminsOfWork.filter((userObject) => userObject.email).map((userObject) => userObject.email as string);
  };

  queueService.start(QueueName.SecretPushEventScan, async (job) => {
    const appCfg = getConfig();
    const { organizationId, commits, pusher, repository, installationId } = job.data;
    const [owner, repo] = repository.fullName.split("/");
    const octokit = new ProbotOctokit({
      auth: {
        appId: appCfg.SECRET_SCANNING_GIT_APP_ID,
        privateKey: appCfg.SECRET_SCANNING_PRIVATE_KEY,
        installationId
      }
    });
    const allFindingsByFingerprint: { [key: string]: SecretMatch } = {};

    for (const commit of commits) {
      for (const filepath of [...commit.added, ...commit.modified]) {
        // eslint-disable-next-line
        const fileContentsResponse = await octokit.repos.getContent({
          owner,
          repo,
          path: filepath
        });

        const { data } = fileContentsResponse;
        const fileContent = Buffer.from((data as { content: string }).content, "base64").toString();

        // eslint-disable-next-line
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

          allFindingsByFingerprint[fingerPrintWithCommitId] = finding;
        }
      }
    }
    await secretScanningDAL.transaction(async (tx) => {
      if (!Object.keys(allFindingsByFingerprint).length) return;
      await secretScanningDAL.upsert(
        Object.keys(allFindingsByFingerprint).map((key) => ({
          installationId,
          email: allFindingsByFingerprint[key].Email,
          author: allFindingsByFingerprint[key].Author,
          date: allFindingsByFingerprint[key].Date,
          file: allFindingsByFingerprint[key].File,
          tags: allFindingsByFingerprint[key].Tags,
          commit: allFindingsByFingerprint[key].Commit,
          ruleID: allFindingsByFingerprint[key].RuleID,
          endLine: String(allFindingsByFingerprint[key].EndLine),
          entropy: String(allFindingsByFingerprint[key].Entropy),
          message: allFindingsByFingerprint[key].Message,
          endColumn: String(allFindingsByFingerprint[key].EndColumn),
          startLine: String(allFindingsByFingerprint[key].StartLine),
          startColumn: String(allFindingsByFingerprint[key].StartColumn),
          fingerPrintWithoutCommitId: allFindingsByFingerprint[key].FingerPrintWithoutCommitId,
          description: allFindingsByFingerprint[key].Description,
          symlinkFile: allFindingsByFingerprint[key].SymlinkFile,
          orgId: organizationId,
          pusherEmail: pusher.email,
          pusherName: pusher.name,
          repositoryFullName: repository.fullName,
          repositoryId: String(repository.id),
          fingerprint: allFindingsByFingerprint[key].Fingerprint
        })),
        tx
      );
    });

    const adminEmails = await getOrgAdminEmails(organizationId);
    if (pusher?.email) {
      adminEmails.push(pusher.email);
    }
    if (Object.keys(allFindingsByFingerprint).length) {
      await smtpService.sendMail({
        template: SmtpTemplates.SecretLeakIncident,
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
        recipients: adminEmails.filter((email) => email).map((email) => email),
        substitutions: {
          numberOfSecrets: Object.keys(allFindingsByFingerprint).length,
          pusher_email: pusher.email,
          pusher_name: pusher.name
        }
      });
    }

    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.SecretScannerPush,
      distinctId: repository.fullName,
      properties: {
        numberOfRisks: Object.keys(allFindingsByFingerprint).length
      }
    });
  });

  queueService.start(QueueName.SecretFullRepoScan, async (job) => {
    const appCfg = getConfig();
    const { organizationId, repository, installationId } = job.data;
    const octokit = new ProbotOctokit({
      auth: {
        appId: appCfg.SECRET_SCANNING_GIT_APP_ID,
        privateKey: appCfg.SECRET_SCANNING_PRIVATE_KEY,
        installationId
      }
    });

    const findings = await scanFullRepoContentAndGetFindings(
      // this is because of collision of octokit in probot and github
      // eslint-disable-next-line
      octokit as any,
      installationId,
      repository.fullName
    );
    await secretScanningDAL.transaction(async (tx) => {
      if (!findings.length) return;
      // eslint-disable-next-line
      await secretScanningDAL.upsert(
        findings.map((finding) => ({
          installationId,
          email: finding.Email,
          author: finding.Author,
          date: finding.Date,
          file: finding.File,
          tags: finding.Tags,
          commit: finding.Commit,
          ruleID: finding.RuleID,
          endLine: String(finding.EndLine),
          entropy: String(finding.Entropy),
          message: finding.Message,
          endColumn: String(finding.EndColumn),
          startLine: String(finding.StartLine),
          startColumn: String(finding.StartColumn),
          fingerPrintWithoutCommitId: finding.FingerPrintWithoutCommitId,
          description: finding.Description,
          symlinkFile: finding.SymlinkFile,
          orgId: organizationId,
          repositoryFullName: repository.fullName,
          repositoryId: String(repository.id),
          fingerprint: finding.Fingerprint
        })),
        tx
      );
    });

    const adminEmails = await getOrgAdminEmails(organizationId);
    if (findings.length) {
      await smtpService.sendMail({
        template: SmtpTemplates.SecretLeakIncident,
        subjectLine: `Incident alert: leaked secrets found in Github repository ${repository.fullName}`,
        recipients: adminEmails.filter((email) => email).map((email) => email),
        substitutions: {
          numberOfSecrets: findings.length
        }
      });
    }

    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.SecretScannerFull,
      distinctId: repository.fullName,
      properties: {
        numberOfRisks: findings.length
      }
    });
  });

  queueService.listen(QueueName.SecretPushEventScan, "failed", (job, err) => {
    logger.error(err, "Failed to secret scan on push", job?.data);
  });

  queueService.listen(QueueName.SecretFullRepoScan, "failed", (job, err) => {
    logger.error(err, "Failed to do full repo secret scan", job?.data);
  });

  return { startFullRepoScan, startPushEventScan };
};
