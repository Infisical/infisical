import { join } from "path";
import { ProbotOctokit } from "probot";

import {
  SecretScanningDataSource,
  SecretScanningScanTrigger
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  assertProviderRepositorySizeWithinLimit,
  cloneRepository
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  TSecretScanningFactoryGetDiffScanFindingsPayload,
  TSecretScanningFactoryGetRealtimeScanReport,
  TSecretScanningFactoryGetDiffScanResourcePayload,
  TSecretScanningFactoryGetFullScanPath,
  TSecretScanningFactoryGetScanReport,
  TSecretScanningFactoryInitialize,
  TSecretScanningFactoryListRawResources,
  TSecretScanningFactoryPostInitialization,
  TSecretScanningFactorySetupWebhook,
  TSecretScanningFactoryTeardown,
  TSecretScanningFactoryValidateConfigUpdate
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { BasicRepositoryRegex } from "@app/lib/regex";
import { listGitHubRadarRepositories, TGitHubRadarConnection } from "@app/services/app-connection/github-radar";

import {
  createPullRequestScanReport,
  getGitHubRadarInstallationOctokit,
  getPullRequestScanMetadata,
  isGitHubPullRequestScanPayload,
  processGitHubPullRequestEvent,
  scanGitHubCommitsAndGetFindings,
  scanGitHubPullRequest
} from "./github-secret-scanning-fns";
import { GitHubPullRequestScanMetadataSchema } from "./github-secret-scanning-schemas";
import {
  TGitHubDataSourceInput,
  TGitHubDataSourceWithConnection,
  TQueueGitHubResourceDiffScan
} from "./github-secret-scanning-types";

export const GitHubSecretScanningFactory = () => {
  const initialize: TSecretScanningFactoryInitialize<TGitHubDataSourceInput, TGitHubRadarConnection> = async (
    { connection, secretScanningV2DAL },
    callback
  ) => {
    const externalId = connection.credentials.installationId;

    const existingDataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId,
      type: SecretScanningDataSource.GitHub
    });

    if (existingDataSource)
      throw new BadRequestError({
        message: `A Data Source already exists for this GitHub Radar Connection in the Project with ID "${existingDataSource.projectId}"`
      });

    return callback({
      externalId
    });
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<
    TGitHubDataSourceInput,
    TGitHubRadarConnection
  > = async () => {
    // no post-initialization required
  };

  const teardown: TSecretScanningFactoryTeardown<TGitHubDataSourceWithConnection> = async () => {
    // no teardown required
  };

  // Push events arrive through the GitHub App installation, so there is no webhook to create.
  const setupWebhook: TSecretScanningFactorySetupWebhook<TGitHubDataSourceWithConnection> = async () => undefined;

  const validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<
    TGitHubDataSourceInput["config"],
    TGitHubDataSourceWithConnection
  > = async () => {
    // no validation required
  };

  const listRawResources: TSecretScanningFactoryListRawResources<TGitHubDataSourceWithConnection> = async (
    dataSource
  ) => {
    const repos = await listGitHubRadarRepositories(dataSource.connection);

    return repos.map(({ id, full_name }) => ({
      name: full_name,
      externalId: id.toString()
    }));
  };

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TGitHubDataSourceWithConnection> = async ({
    dataSource,
    resourceName,
    tempFolder
  }) => {
    const appCfg = getConfig();
    const {
      connection: {
        credentials: { installationId }
      }
    } = dataSource;

    const octokit = new ProbotOctokit({
      auth: {
        appId: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID,
        privateKey: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY,
        installationId
      }
    });

    const {
      data: { token }
    } = await octokit.apps.createInstallationAccessToken({
      installation_id: Number(installationId)
    });

    const repoPath = join(tempFolder, "repo.git");

    if (!BasicRepositoryRegex.test(resourceName)) {
      throw new Error("Invalid GitHub repository name");
    }

    const [owner, repo] = resourceName.split("/");

    // Checked before the clone: measuring afterwards means the network, wall clock and ephemeral
    // disk have already been spent. GitHub reports `size` in KB.
    await assertProviderRepositorySizeWithinLimit(resourceName, async () => {
      const { data: repository } = await octokit.repos.get({ owner, repo });
      return repository.size == null ? null : repository.size * 1024;
    });

    await cloneRepository({
      cloneUrl: `https://x-access-token:${token}@github.com/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueGitHubResourceDiffScan["payload"]
  > = ({ repository }) => {
    return {
      name: repository.full_name,
      externalId: repository.id.toString()
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TGitHubDataSourceWithConnection,
    TQueueGitHubResourceDiffScan["payload"]
  > = async ({ dataSource, payload, resourceName, configPath }) => {
    if (isGitHubPullRequestScanPayload(payload)) {
      return scanGitHubPullRequest({ payload, resourceName, configPath });
    }

    const { commits, repository } = payload;

    const findings = await scanGitHubCommitsAndGetFindings({
      octokit: getGitHubRadarInstallationOctokit(dataSource.connection.credentials.installationId),
      repositoryFullName: repository.full_name,
      resourceName,
      commits: commits.map((commit) => ({
        sha: commit.id,
        authorName: commit.author.name,
        authorEmail: commit.author.email ?? "",
        date: commit.timestamp,
        message: commit.message
      })),
      configPath
    });

    return { findings };
  };

  // Pull request scans report to the check run they were created for; pushes report nowhere.
  const getRealtimeScanReport: TSecretScanningFactoryGetRealtimeScanReport<TQueueGitHubResourceDiffScan["payload"]> = (
    payload
  ) => {
    if (!isGitHubPullRequestScanPayload(payload)) return undefined;

    return createPullRequestScanReport({
      installationId: payload.installationId,
      repositoryFullName: payload.repository.full_name,
      metadata: getPullRequestScanMetadata(payload),
      findingsUrl: payload.findingsUrl
    });
  };

  const getScanReport: TSecretScanningFactoryGetScanReport = ({ scan, dataSource, resourceName }) => {
    if (scan.trigger !== SecretScanningScanTrigger.PullRequest || !dataSource.externalId) return undefined;

    const metadata = GitHubPullRequestScanMetadataSchema.safeParse(scan.metadata);
    if (!metadata.success) return undefined;

    return createPullRequestScanReport({
      // A GitHub data source's external ID is its installation ID.
      installationId: dataSource.externalId,
      repositoryFullName: resourceName,
      metadata: metadata.data
    });
  };

  return {
    initialize,
    postInitialization,
    listRawResources,
    getFullScanPath,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    getRealtimeScanReport,
    getScanReport,
    processEvent: processGitHubPullRequestEvent,
    teardown,
    setupWebhook,
    validateConfigUpdate
  };
};
