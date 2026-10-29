import { Repository } from "@octokit/webhooks-types";
import { z } from "zod";

import { TSecretScanningDataSources, TSecretScanningResources, TSecretScanningResourcesInsert } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanTrigger
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { GitHubPullRequestEvent } from "./github-secret-scanning-enums";
import {
  createPullRequestCheckRun,
  getLatestPullRequestCheckRunExternalId,
  isPullRequestCheckSkipStatus
} from "./github-secret-scanning-fns";
import { GitHubPullRequestScanMetadataSchema } from "./github-secret-scanning-schemas";
import { TGitHubPullRequestScanPayload, TQueueGitHubPullRequestEvent } from "./github-secret-scanning-types";

type TGitHubPullRequestEventsFactoryDep = {
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  discoverResource: (params: {
    dataSource: Pick<TSecretScanningDataSources, "id" | "isHistoricalScanEnabled">;
    resourcePayload: Pick<TSecretScanningResourcesInsert, "externalId" | "name">;
    trigger: SecretScanningScanTrigger.PullRequest;
  }) => Promise<TSecretScanningResources | undefined>;
  queuePullRequestScan: (params: {
    scanId: string;
    dataSourceId: string;
    resourceId: string;
    payload: TGitHubPullRequestScanPayload;
  }) => Promise<void>;
};

// Runs in the secret scanning worker, so the webhook only has to enqueue the event.
export const githubPullRequestEventsFactory = ({
  secretScanningV2DAL,
  auditLogService,
  discoverResource,
  queuePullRequestScan
}: TGitHubPullRequestEventsFactoryDep) => {
  // Pull requests are checked only while the data source scans new commits. A repository the data source doesn't cover
  // yet is discovered the same way a push discovers it, or skipped when discovery is off. If the check run cannot be
  // created, usually because the installation has not accepted the Checks permission, there is nothing to report to
  // and nothing is scanned.
  const startPullRequestScan = async ({
    installationId,
    repository,
    pullRequest,
    expectedResourceId
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    pullRequest: TGitHubPullRequestScanPayload["pullRequest"];
    expectedResourceId?: string;
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [pullRequest=${pullRequest.number}] [headSha=${pullRequest.headSha}]`;

    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installationId),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(`secretScanningV2PullRequestEvent: GitHub - Could not find data source ${logDetails}`);
      return;
    }

    if (!dataSource.isScanNewCommitsEnabled) {
      logger.info(
        `secretScanningV2PullRequestEvent: GitHub - ignoring pull request, scanning new commits is disabled ${logDetails}`
      );
      return;
    }

    const existingResource = await secretScanningV2DAL.resources.findOne({
      dataSourceId: dataSource.id,
      externalId: String(repository.id)
    });

    if (!existingResource && !dataSource.isDiscoveryEnabled) {
      logger.info(
        `secretScanningV2PullRequestEvent: GitHub - ignoring pull request from unknown repository, discovery is disabled ${logDetails}`
      );
      return;
    }

    const resource =
      existingResource ??
      (await discoverResource({
        dataSource,
        resourcePayload: { name: repository.full_name, externalId: String(repository.id) },
        trigger: SecretScanningScanTrigger.PullRequest
      }));

    if (!resource) return;

    if (expectedResourceId && expectedResourceId !== resource.id) {
      logger.warn(
        `secretScanningV2PullRequestEvent: GitHub - ignoring re-run, the scan belongs to another resource ${logDetails} [expectedResourceId=${expectedResourceId}] [resourceId=${resource.id}]`
      );
      return;
    }

    const scanId = crypto.nativeCrypto.randomUUID();
    const { SITE_URL } = getConfig();
    const orgId = dataSource.connection?.orgId;

    let checkRunId: number;
    try {
      checkRunId = await createPullRequestCheckRun({
        installationId: String(installationId),
        repositoryFullName: repository.full_name,
        headSha: pullRequest.headSha,
        scanId,
        detailsUrl:
          SITE_URL && orgId
            ? `${SITE_URL}/organizations/${orgId}/secret-scanning/findings?resourceId=${resource.id}`
            : undefined
      });
    } catch (error) {
      logger.warn(
        error,
        `secretScanningV2PullRequestEvent: GitHub - could not create check run, skipping scan ${logDetails}`
      );
      return;
    }

    await queuePullRequestScan({
      scanId,
      dataSourceId: dataSource.id,
      resourceId: resource.id,
      payload: {
        installationId: String(installationId),
        repository: { id: repository.id, full_name: repository.full_name },
        pullRequest,
        checkRunId
      }
    });
  };

  // A re-run carries no pull request for forks, so the pull request comes from the scan the check run was created for.
  const rerunPullRequestScan = async ({
    installationId,
    repository,
    externalId,
    logDetails
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    externalId: string | null;
    logDetails: string;
  }) => {
    const scanId = z.string().uuid().safeParse(externalId);

    if (!scanId.success) {
      logger.warn(`secretScanningV2CheckRunEvent: GitHub - check run has no scan ID ${logDetails}`);
      return;
    }

    const previousScan = await secretScanningV2DAL.scans.findById(scanId.data);
    const metadata = GitHubPullRequestScanMetadataSchema.safeParse(previousScan?.metadata);

    if (!previousScan || previousScan.trigger !== SecretScanningScanTrigger.PullRequest || !metadata.success) {
      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - ignoring re-run, the pull request scan no longer exists ${logDetails} [scanId=${scanId.data}]`
      );
      return;
    }

    await startPullRequestScan({
      installationId,
      repository,
      pullRequest: {
        number: metadata.data.pullRequestNumber,
        baseSha: metadata.data.baseSha,
        headSha: metadata.data.headSha
      },
      expectedResourceId: previousScan.resourceId
    });
  };

  // "Re-run all checks" names only the suite, so the scan comes from the newest check run of ours in it.
  const rerunCheckSuite = async ({
    installationId,
    repository,
    checkSuiteId
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    checkSuiteId: number;
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [checkSuiteId=${checkSuiteId}]`;

    let externalId: string | null;
    try {
      externalId = await getLatestPullRequestCheckRunExternalId({
        installationId: String(installationId),
        repositoryFullName: repository.full_name,
        checkSuiteId
      });
    } catch (error) {
      logger.warn(
        error,
        `secretScanningV2CheckSuiteEvent: GitHub - could not list the suite's check runs ${logDetails}`
      );
      return;
    }

    if (!externalId) {
      logger.info(
        `secretScanningV2CheckSuiteEvent: GitHub - ignoring re-run, the suite has no pull request check ${logDetails}`
      );
      return;
    }

    await rerunPullRequestScan({ installationId, repository, externalId, logDetails });
  };

  // GitHub shows the skip buttons to anyone with write access to the repository, so the scan the check run names is
  // confirmed to belong to the installation and repository the event came from before any finding is changed. The
  // findings are then triaged as Infisical's own triage would, and the check is run again, which passes once every
  // finding in it is skipped.
  const skipPullRequestFindings = async ({
    installationId,
    repository,
    checkRunId,
    externalId,
    action,
    sender
  }: {
    installationId: number;
    repository: Pick<Repository, "id" | "full_name">;
    checkRunId: number;
    externalId: string | null;
    action: string;
    sender: { id: number; login: string };
  }) => {
    const logDetails = `[installationId=${installationId}] [repository=${repository.full_name}] [checkRunId=${checkRunId}] [action=${action}] [sender=${sender.login}]`;

    if (!isPullRequestCheckSkipStatus(action)) {
      logger.warn(`secretScanningV2CheckRunEvent: GitHub - ignoring unknown check run action ${logDetails}`);
      return;
    }

    const scanId = z.string().uuid().safeParse(externalId);
    const previousScan = scanId.success ? await secretScanningV2DAL.scans.findById(scanId.data) : undefined;
    const metadata = GitHubPullRequestScanMetadataSchema.safeParse(previousScan?.metadata);

    if (!previousScan || previousScan.trigger !== SecretScanningScanTrigger.PullRequest || !metadata.success) {
      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - ignoring skip, the pull request scan no longer exists ${logDetails}`
      );
      return;
    }

    const resource = await secretScanningV2DAL.resources.findById(previousScan.resourceId);
    const dataSource = resource ? await secretScanningV2DAL.dataSources.findById(resource.dataSourceId) : undefined;

    if (
      !resource ||
      !dataSource ||
      dataSource.type !== SecretScanningDataSource.GitHub ||
      dataSource.externalId !== String(installationId) ||
      resource.externalId !== String(repository.id)
    ) {
      logger.warn(
        `secretScanningV2CheckRunEvent: GitHub - ignoring skip, the scan does not belong to this repository ${logDetails} [scanId=${previousScan.id}]`
      );
      return;
    }

    const { pullRequestNumber, findingIds = [] } = metadata.data;

    const findings = findingIds.length
      ? await secretScanningV2DAL.findings.find({ resourceId: resource.id, $in: { id: findingIds } })
      : [];
    const findingsToSkip = findings.filter((finding) => !isPullRequestCheckSkipStatus(finding.status));

    if (findingsToSkip.length) {
      const triageComment = `${
        action === SecretScanningFindingStatus.FalsePositive ? "Marked as a false positive" : "Ignored"
      } from GitHub by @${sender.login} on pull request ${repository.full_name}#${pullRequestNumber}.`;
      const now = new Date();

      await secretScanningV2DAL.findings.update(
        { $in: { id: findingsToSkip.map((finding) => finding.id) } },
        { status: action, triageComment, triagedAt: now, triagedByUserId: null, resolvedAt: null }
      );

      await Promise.all(
        findingsToSkip.map((finding) =>
          auditLogService.createAuditLog({
            projectId: dataSource.projectId,
            actor: {
              type: ActorType.PLATFORM,
              metadata: {}
            },
            event: {
              type: EventType.SECRET_SCANNING_FINDING_UPDATE,
              metadata: { findingId: finding.id, status: action, triageComment }
            }
          })
        )
      );

      logger.info(
        `secretScanningV2CheckRunEvent: GitHub - skipped pull request findings ${logDetails} [scanId=${previousScan.id}] [findings=${findingsToSkip.length}]`
      );
    }

    await startPullRequestScan({
      installationId,
      repository,
      pullRequest: {
        number: pullRequestNumber,
        baseSha: metadata.data.baseSha,
        headSha: metadata.data.headSha
      },
      expectedResourceId: resource.id
    });
  };

  const processPullRequestEvent = async (job: TQueueGitHubPullRequestEvent) => {
    const { installationId, repository } = job;

    switch (job.event) {
      case GitHubPullRequestEvent.PullRequest:
        return startPullRequestScan({ installationId, repository, pullRequest: job.pullRequest });
      case GitHubPullRequestEvent.CheckRunRerequested:
        return rerunPullRequestScan({
          installationId,
          repository,
          externalId: job.externalId,
          logDetails: `[installationId=${installationId}] [repository=${repository.full_name}] [checkRunId=${job.checkRunId}]`
        });
      case GitHubPullRequestEvent.CheckSuiteRerequested:
        return rerunCheckSuite({ installationId, repository, checkSuiteId: job.checkSuiteId });
      case GitHubPullRequestEvent.CheckRunRequestedAction:
        return skipPullRequestFindings({
          installationId,
          repository,
          checkRunId: job.checkRunId,
          externalId: job.externalId,
          action: job.action,
          sender: job.sender
        });
      default:
        logger.error(
          `secretScanningV2PullRequestEvent: GitHub - unhandled event [event=${(job as { event: string }).event}]`
        );
    }
  };

  return { processPullRequestEvent };
};
