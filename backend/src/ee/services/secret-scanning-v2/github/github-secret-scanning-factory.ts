import { join } from "path";
import { ProbotOctokit } from "probot";

import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import {
  SecretScanningDataSource,
  SecretScanningFindingSeverity,
  SecretScanningResource
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { cloneRepository } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  TSecretScanningFactoryGetDiffScanFindingsPayload,
  TSecretScanningFactoryGetDiffScanResourcePayload,
  TSecretScanningFactoryGetFullScanPath,
  TSecretScanningFactoryInitialize,
  TSecretScanningFactoryListRawResources,
  TSecretScanningFactoryPostInitialization
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { titleCaseToCamelCase } from "@app/lib/fn";
import { listGitHubRadarRepositories, TGitHubRadarConnection } from "@app/services/app-connection/github-radar";

import { TGitHubDataSourceWithConnection, TQueueGitHubResourceDiffScan } from "./github-secret-scanning-types";

export const GitHubSecretScanningFactory = () => {
  const initialize: TSecretScanningFactoryInitialize<TGitHubRadarConnection> = async (
    { connection, secretScanningV2DAL },
    callback
  ) => {
    const externalId = connection.credentials.installationId;

    const existingDataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId,
      type: SecretScanningDataSource.GitHub
    });

    if (existingDataSource)
      throw new BadRequestError({ message: "A Data Source already exists for this GitHub Radar Connection" });

    return callback({
      externalId
    });
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<TGitHubRadarConnection> = async () => {
    // no post-initialization required
  };

  const listRawResources: TSecretScanningFactoryListRawResources<TGitHubDataSourceWithConnection> = async (
    dataSource
  ) => {
    const {
      connection,
      config: { includeRepos }
    } = dataSource;

    const repos = await listGitHubRadarRepositories(connection);

    const filteredRepos: typeof repos = [];
    if (includeRepos.includes("*")) {
      filteredRepos.push(...repos);
    } else {
      filteredRepos.push(...repos.filter((repo) => includeRepos.includes(repo.full_name)));
    }

    return filteredRepos.map(({ id, full_name }) => ({
      name: full_name,
      externalId: id.toString(),
      type: SecretScanningResource.Repository
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
      externalId: repository.id.toString(),
      type: SecretScanningResource.Repository
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TGitHubDataSourceWithConnection,
    TQueueGitHubResourceDiffScan["payload"]
  > = async ({ dataSource, payload, resourceName }) => {
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

    const { commits, repository } = payload;

    const [owner, repo] = repository.full_name.split("/");

    const allFindings: SecretMatch[] = [];

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

        allFindings.push(
          ...findings.map((finding) => ({
            ...finding,
            File: filepath,
            Commit: commit.id,
            Author: commit.author.name,
            Email: commit.author.email ?? "",
            Message: commit.message,
            Fingerprint: `${commit.id}:${filepath}:${finding.RuleID}:${finding.StartLine}`,
            Date: commit.timestamp,
            Link: `https://github.com/${resourceName}/blob/${commit.id}/${filepath}#L${finding.StartLine}`
          }))
        );
      }
    }

    return allFindings.map(
      ({
        // discard match and secret as we don't want to store
        Match,
        Secret,
        ...finding
      }) => ({
        details: titleCaseToCamelCase(finding),
        fingerprint: finding.Fingerprint,
        severity: SecretScanningFindingSeverity.High,
        rule: finding.RuleID
      })
    );
  };

  return {
    initialize,
    postInitialization,
    listRawResources,
    getFullScanPath,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload
  };
};
