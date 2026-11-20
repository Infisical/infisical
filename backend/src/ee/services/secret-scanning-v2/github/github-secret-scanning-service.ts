import {
  CheckRunRequestedActionEvent,
  CheckRunRerequestedEvent,
  CheckSuiteRerequestedEvent,
  PullRequestOpenedEvent,
  PullRequestReopenedEvent,
  PullRequestSynchronizeEvent,
  PushEvent
} from "@octokit/webhooks-types";

import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningV2QueueServiceFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-queue";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { GitHubPullRequestEvent } from "./github-secret-scanning-enums";
import { TQueueGitHubPullRequestEvent } from "./github-secret-scanning-types";

export const githubSecretScanningService = (
  secretScanningV2DAL: TSecretScanningV2DALFactory,
  secretScanningV2Queue: Pick<TSecretScanningV2QueueServiceFactory, "handleResourcePushEvent" | "queueDataSourceEvent">
) => {
  const queuePullRequestEvent = (event: TQueueGitHubPullRequestEvent, deliveryId: string) =>
    secretScanningV2Queue.queueDataSourceEvent({ dataSourceType: SecretScanningDataSource.GitHub, event }, deliveryId);

  const handleInstallationDeletedEvent = async (installationId: number) => {
    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installationId),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(
        `secretScanningV2RemoveEvent: GitHub - Could not find data source [installationId=${installationId}]`
      );
      return;
    }

    logger.info(
      `secretScanningV2RemoveEvent: GitHub - installation deleted [installationId=${installationId}] [dataSourceId=${dataSource.id}]`
    );

    await secretScanningV2DAL.dataSources.updateById(dataSource.id, {
      isDisconnected: true
    });
  };

  const handlePushEvent = async (payload: PushEvent) => {
    const { commits, repository, installation } = payload;

    if (!commits || !repository || !installation) {
      logger.warn(
        `secretScanningV2PushEvent: GitHub - Insufficient data [commits=${commits?.length ?? 0}] [repository=${repository.name}] [installationId=${installation?.id}]`
      );
      return;
    }

    const dataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId: String(installation.id),
      type: SecretScanningDataSource.GitHub
    });

    if (!dataSource) {
      logger.error(
        `secretScanningV2PushEvent: GitHub - Could not find data source [installationId=${installation.id}]`
      );
      return;
    }

    await secretScanningV2Queue.handleResourcePushEvent({
      dataSource,
      dataSourceType: SecretScanningDataSource.GitHub,
      payload
    });
  };

  // The pull request events below only enqueue; processGitHubPullRequestEvent processes them in the
  // secret scanning worker, so the webhook responds before any GitHub API call or scan is made.
  const handlePullRequestEvent = async (
    payload: PullRequestOpenedEvent | PullRequestSynchronizeEvent | PullRequestReopenedEvent,
    deliveryId: string
  ) => {
    const { installation, repository, pull_request: pullRequest } = payload;

    if (!installation) {
      logger.warn(
        `secretScanningV2PullRequestEvent: GitHub - Insufficient data [repository=${repository.full_name}] [pullRequest=${pullRequest.number}]`
      );
      return;
    }

    await queuePullRequestEvent(
      {
        event: GitHubPullRequestEvent.PullRequest,
        installationId: installation.id,
        repository: { id: repository.id, full_name: repository.full_name },
        pullRequest: {
          number: pullRequest.number,
          baseSha: pullRequest.base.sha,
          headSha: pullRequest.head.sha
        },
        // A fork whose repository was deleted has no head repository.
        isFromFork: pullRequest.head.repo?.id !== repository.id
      },
      deliveryId
    );
  };

  const handleCheckRunRerequestedEvent = async (payload: CheckRunRerequestedEvent, deliveryId: string) => {
    const { check_run: checkRun, installation, repository } = payload;

    if (!installation) {
      logger.warn(
        `secretScanningV2CheckRunEvent: GitHub - Insufficient data [repository=${repository.full_name}] [checkRunId=${checkRun.id}]`
      );
      return;
    }

    if (String(checkRun.app.id) !== getConfig().INF_APP_CONNECTION_GITHUB_RADAR_APP_ID) return;

    await queuePullRequestEvent(
      {
        event: GitHubPullRequestEvent.CheckRunRerequested,
        installationId: installation.id,
        repository: { id: repository.id, full_name: repository.full_name },
        checkRunId: checkRun.id,
        externalId: checkRun.external_id
      },
      deliveryId
    );
  };

  const handleCheckSuiteRerequestedEvent = async (payload: CheckSuiteRerequestedEvent, deliveryId: string) => {
    const { check_suite: checkSuite, installation, repository } = payload;

    if (!installation) {
      logger.warn(
        `secretScanningV2CheckSuiteEvent: GitHub - Insufficient data [repository=${repository.full_name}] [checkSuiteId=${checkSuite.id}]`
      );
      return;
    }

    if (String(checkSuite.app.id) !== getConfig().INF_APP_CONNECTION_GITHUB_RADAR_APP_ID) return;

    await queuePullRequestEvent(
      {
        event: GitHubPullRequestEvent.CheckSuiteRerequested,
        installationId: installation.id,
        repository: { id: repository.id, full_name: repository.full_name },
        checkSuiteId: checkSuite.id
      },
      deliveryId
    );
  };

  const handleCheckRunRequestedActionEvent = async (payload: CheckRunRequestedActionEvent, deliveryId: string) => {
    const { check_run: checkRun, installation, repository, requested_action: requestedAction, sender } = payload;

    if (!installation || !requestedAction.identifier) {
      logger.warn(
        `secretScanningV2CheckRunEvent: GitHub - Insufficient data [repository=${repository.full_name}] [checkRunId=${checkRun.id}]`
      );
      return;
    }

    if (String(checkRun.app.id) !== getConfig().INF_APP_CONNECTION_GITHUB_RADAR_APP_ID) return;

    await queuePullRequestEvent(
      {
        event: GitHubPullRequestEvent.CheckRunRequestedAction,
        installationId: installation.id,
        repository: { id: repository.id, full_name: repository.full_name },
        checkRunId: checkRun.id,
        externalId: checkRun.external_id,
        action: requestedAction.identifier,
        sender: { id: sender.id, login: sender.login }
      },
      deliveryId
    );
  };

  return {
    handlePushEvent,
    handlePullRequestEvent,
    handleCheckRunRerequestedEvent,
    handleCheckSuiteRerequestedEvent,
    handleCheckRunRequestedActionEvent,
    handleInstallationDeletedEvent
  };
};
