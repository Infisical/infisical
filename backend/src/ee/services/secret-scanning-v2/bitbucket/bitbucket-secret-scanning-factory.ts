import { join } from "path";

import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import {
  SecretScanningDataSource,
  SecretScanningFindingSeverity,
  SecretScanningResource
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  cloneRepository,
  convertPatchLineToFileLineNumber,
  replaceNonChangesWithNewlines
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  TSecretScanningFactoryGetDiffScanFindingsPayload,
  TSecretScanningFactoryGetDiffScanResourcePayload,
  TSecretScanningFactoryGetFullScanPath,
  TSecretScanningFactoryInitialize,
  TSecretScanningFactoryListRawResources,
  TSecretScanningFactoryPostInitialization
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { titleCaseToCamelCase } from "@app/lib/fn";
import { GitHubRepositoryRegex } from "@app/lib/regex";
import {
  getBitBucketUser,
  listBitBucketRepositories,
  TBitBucketConnection
} from "@app/services/app-connection/bitbucket";

import { TBitBucketDataSourceWithConnection, TQueueBitBucketResourceDiffScan } from "./bitbucket-secret-scanning-types";

export const BitBucketSecretScanningFactory = () => {
  const initialize: TSecretScanningFactoryInitialize<TBitBucketConnection> = async (
    { connection, secretScanningV2DAL },
    callback
  ) => {
    // TODO(andrey): Swap for something proper
    const externalId = connection.credentials.email;

    const existingDataSource = await secretScanningV2DAL.dataSources.findOne({
      externalId,
      type: SecretScanningDataSource.BitBucket
    });

    if (existingDataSource)
      throw new BadRequestError({
        message: `A Data Source already exists for this BitBucket Radar Connection in the Project with ID "${existingDataSource.projectId}"`
      });

    return callback({
      externalId
    });
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<TBitBucketConnection> = async () => {
    // no post-initialization required
  };

  const listRawResources: TSecretScanningFactoryListRawResources<TBitBucketDataSourceWithConnection> = async (
    dataSource
  ) => {
    const {
      connection,
      config: { includeRepos }
    } = dataSource;

    const repos = await listBitBucketRepositories(connection);

    const filteredRepos: typeof repos = [];
    if (includeRepos.includes("*")) {
      filteredRepos.push(...repos);
    } else {
      filteredRepos.push(...repos.filter((repo) => includeRepos.includes(repo.full_name)));
    }

    return filteredRepos.map(({ slug, full_name }) => ({
      name: full_name,
      externalId: slug.toString(),
      type: SecretScanningResource.Repository
    }));
  };

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TBitBucketDataSourceWithConnection> = async ({
    dataSource,
    resourceName,
    tempFolder
  }) => {
    const {
      connection: {
        credentials: { apiToken, email }
      }
    } = dataSource;

    const repoPath = join(tempFolder, "repo.git");

    if (!GitHubRepositoryRegex.test(resourceName)) {
      throw new Error("Invalid BitBucket repository name");
    }

    const { username } = await getBitBucketUser({ email, apiToken });

    await cloneRepository({
      cloneUrl: `https://${encodeURIComponent(username)}:${apiToken}@bitbucket.org/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueBitBucketResourceDiffScan["payload"]
  > = ({ repository }) => {
    return {
      name: repository.full_name,
      externalId: repository.id.toString(),
      type: SecretScanningResource.Repository
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TBitBucketDataSourceWithConnection,
    TQueueBitBucketResourceDiffScan["payload"]
  > = async ({ dataSource, payload, resourceName, configPath }) => {
    const {
      connection: {
        credentials: { apiToken, email }
      }
    } = dataSource;

    const { commits, repository } = payload;

    const allFindings: SecretMatch[] = [];

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

    for (const commit of commits) {
      // eslint-disable-next-line no-await-in-loop
      const { data: diffstat } = await request.get<{
        values: {
          status: "added" | "modified" | "removed" | "renamed";
          new?: { path: string };
          old?: { path: string };
        }[];
      }>(`https://api.bitbucket.org/2.0/repositories/${repository.full_name}/diffstat/${commit.id}`, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json"
        }
      });

      // eslint-disable-next-line no-continue
      if (!diffstat.values) continue;

      for (const file of diffstat.values) {
        if ((file.status === "added" || file.status === "modified") && file.new?.path) {
          const filePath = file.new.path;

          // eslint-disable-next-line no-await-in-loop
          const { data: patch } = await request.get<string>(
            `https://api.bitbucket.org/2.0/repositories/${repository.full_name}/diff/${commit.id}`,
            {
              params: {
                path: filePath
              },
              headers: {
                Authorization: authHeader
              },
              responseType: "text"
            }
          );

          // eslint-disable-next-line no-continue
          if (!patch) continue;

          // eslint-disable-next-line
          const findings = await scanContentAndGetFindings(replaceNonChangesWithNewlines(`\n${patch}`), configPath);

          const adjustedFindings = findings.map((finding) => {
            const startLine = convertPatchLineToFileLineNumber(patch, finding.StartLine);
            const endLine =
              finding.StartLine === finding.EndLine
                ? startLine
                : convertPatchLineToFileLineNumber(patch, finding.EndLine);
            const startColumn = finding.StartColumn - 1; // subtract 1 for +
            const endColumn = finding.EndColumn - 1; // subtract 1 for +

            return {
              ...finding,
              StartLine: startLine,
              EndLine: endLine,
              StartColumn: startColumn,
              EndColumn: endColumn,
              File: filePath,
              Commit: commit.id,
              Author: commit.author.name,
              Email: commit.author.email ?? "",
              Message: commit.message,
              Fingerprint: `${commit.id}:${filePath}:${finding.RuleID}:${startLine}:${startColumn}`,
              Date: commit.timestamp,
              Link: `https://bitbucket.org/${resourceName}/src/${commit.id}/${filePath}#lines-${startLine}`
            };
          });

          allFindings.push(...adjustedFindings);
        }
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
