import { join } from "path";

import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import {
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
  TSecretScanningFactoryPostInitialization,
  TSecretScanningFactoryTeardown,
  TSecretScanningFactoryValidateConfigUpdate
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { titleCaseToCamelCase } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { BasicRepositoryRegex } from "@app/lib/regex";
import {
  getBitbucketUser,
  listBitbucketRepositories,
  TBitbucketConnection
} from "@app/services/app-connection/bitbucket";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import {
  TBitbucketDataSourceCredentials,
  TBitbucketDataSourceInput,
  TBitbucketDataSourceWithConnection,
  TQueueBitbucketResourceDiffScan
} from "./bitbucket-secret-scanning-types";

export const BitbucketSecretScanningFactory = () => {
  const initialize: TSecretScanningFactoryInitialize<
    TBitbucketDataSourceInput,
    TBitbucketConnection,
    TBitbucketDataSourceCredentials
  > = async ({ connection, payload }, callback) => {
    const cfg = getConfig();

    const { email, apiToken } = connection.credentials;
    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

    const { data } = await request.post<{ uuid: string }>(
      `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces/${encodeURIComponent(payload.config.workspaceSlug)}/hooks`,
      {
        description: "Infisical webhook for push events",
        url: `${cfg.SITE_URL}/secret-scanning/webhooks/bitbucket`,
        active: false,
        events: ["repo:push"]
      },
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/json"
        }
      }
    );

    return callback({
      credentials: { webhookId: data.uuid, webhookSecret: alphaNumericNanoId(64) }
    });
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<
    TBitbucketDataSourceInput,
    TBitbucketConnection,
    TBitbucketDataSourceCredentials
  > = async ({ dataSourceId, credentials, connection, payload }) => {
    const { email, apiToken } = connection.credentials;
    const { webhookId, webhookSecret } = credentials;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

    const cfg = getConfig();
    const newWebhookUrl = `${cfg.SITE_URL}/secret-scanning/webhooks/bitbucket?dataSourceId=${dataSourceId}`;

    await request.put(
      `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces/${encodeURIComponent(payload.config.workspaceSlug)}/hooks/${webhookId}`,
      {
        description: "Infisical webhook for push events",
        url: newWebhookUrl,
        active: true,
        events: ["repo:push"],
        secret: webhookSecret
      },
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/json"
        }
      }
    );
  };

  const teardown: TSecretScanningFactoryTeardown<
    TBitbucketDataSourceWithConnection,
    TBitbucketDataSourceCredentials
  > = async ({ credentials, dataSource }) => {
    const {
      connection: {
        credentials: { email, apiToken }
      },
      config
    } = dataSource;
    const { webhookId } = credentials;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

    try {
      await request.delete(
        `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces/${config.workspaceSlug}/hooks/${webhookId}`,
        {
          headers: {
            Authorization: authHeader,
            Accept: "application/json"
          }
        }
      );
    } catch (err) {
      logger.error(`teardown: Bitbucket - Failed to call delete on webhook [webhookId=${webhookId}]`);
    }
  };

  const listRawResources: TSecretScanningFactoryListRawResources<TBitbucketDataSourceWithConnection> = async (
    dataSource
  ) => {
    const {
      connection,
      config: { includeRepos, workspaceSlug }
    } = dataSource;

    const repos = await listBitbucketRepositories(connection, workspaceSlug);

    const filteredRepos: typeof repos = [];
    if (includeRepos.includes("*")) {
      filteredRepos.push(...repos);
    } else {
      filteredRepos.push(...repos.filter((repo) => includeRepos.includes(repo.full_name)));
    }

    return filteredRepos.map(({ full_name, uuid }) => ({
      name: full_name,
      externalId: uuid,
      type: SecretScanningResource.Repository
    }));
  };

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TBitbucketDataSourceWithConnection> = async ({
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

    if (!BasicRepositoryRegex.test(resourceName)) {
      throw new Error("Invalid Bitbucket repository name");
    }

    const { username } = await getBitbucketUser({ email, apiToken });

    await cloneRepository({
      cloneUrl: `https://${encodeURIComponent(username)}:${apiToken}@bitbucket.org/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueBitbucketResourceDiffScan["payload"]
  > = ({ repository }) => {
    return {
      name: repository.full_name,
      externalId: repository.uuid,
      type: SecretScanningResource.Repository
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TBitbucketDataSourceWithConnection,
    TQueueBitbucketResourceDiffScan["payload"]
  > = async ({ dataSource, payload, resourceName, configPath }) => {
    const {
      connection: {
        credentials: { apiToken, email }
      }
    } = dataSource;

    const { push, repository } = payload;

    const allFindings: SecretMatch[] = [];

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;

    for (const change of push.changes) {
      for (const commit of change.commits) {
        // eslint-disable-next-line no-await-in-loop
        const { data: diffstat } = await request.get<{
          values: {
            status: "added" | "modified" | "removed" | "renamed";
            new?: { path: string };
            old?: { path: string };
          }[];
        }>(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${repository.full_name}/diffstat/${commit.hash}`, {
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
              `https://api.bitbucket.org/2.0/repositories/${repository.full_name}/diff/${commit.hash}`,
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

            // eslint-disable-next-line no-await-in-loop
            const findings = await scanContentAndGetFindings(replaceNonChangesWithNewlines(`\n${patch}`), configPath);

            const adjustedFindings = findings.map((finding) => {
              const startLine = convertPatchLineToFileLineNumber(patch, finding.StartLine);
              const endLine =
                finding.StartLine === finding.EndLine
                  ? startLine
                  : convertPatchLineToFileLineNumber(patch, finding.EndLine);
              const startColumn = finding.StartColumn - 1; // subtract 1 for +
              const endColumn = finding.EndColumn - 1; // subtract 1 for +
              const authorName = commit.author.user?.display_name || commit.author.raw.split(" <")[0];
              const emailMatch = commit.author.raw.match(/<(.*)>/);
              const authorEmail = emailMatch?.[1] ?? "";

              return {
                ...finding,
                StartLine: startLine,
                EndLine: endLine,
                StartColumn: startColumn,
                EndColumn: endColumn,
                File: filePath,
                Commit: commit.hash,
                Author: authorName,
                Email: authorEmail,
                Message: commit.message,
                Fingerprint: `${commit.hash}:${filePath}:${finding.RuleID}:${startLine}:${startColumn}`,
                Date: commit.date,
                Link: `https://bitbucket.org/${resourceName}/src/${commit.hash}/${filePath}#lines-${startLine}`
              };
            });

            allFindings.push(...adjustedFindings);
          }
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

  const validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<
    TBitbucketDataSourceInput["config"],
    TBitbucketDataSourceWithConnection
  > = async () => {
    // no validation required
  };

  return {
    initialize,
    postInitialization,
    listRawResources,
    getFullScanPath,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    teardown,
    validateConfigUpdate
  };
};
