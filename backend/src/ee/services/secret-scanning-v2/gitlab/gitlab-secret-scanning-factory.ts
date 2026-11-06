import { Camelize, GitbeakerRequestError, GroupHookSchema, ProjectHookSchema } from "@gitbeaker/rest";
import pLimit from "p-limit";
import { join } from "path";

import { SecretScanningFindingSeverity } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  assertProviderRepositorySizeWithinLimit,
  cloneRepository,
  convertPatchLineToFileLineNumber,
  isDataSourceWebhookRequired,
  replaceNonChangesWithNewlines,
  toFindingDetails
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  TSecretScanningFactoryGetDiffScanFindingsPayload,
  TSecretScanningFactoryGetDiffScanResourcePayload,
  TSecretScanningFactoryGetFullScanPath,
  TSecretScanningFactoryInitialize,
  TSecretScanningFactoryListRawResources,
  TSecretScanningFactoryParams,
  TSecretScanningFactoryPostInitialization,
  TSecretScanningFactorySetupWebhook,
  TSecretScanningFactoryTeardown,
  TSecretScanningFactoryUpdateWebhook,
  TSecretScanningFactoryValidateConfigUpdate
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { scanContentAndGetFindings } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-fns";
import { SecretMatch } from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { GitLabProjectRegex } from "@app/lib/regex";
import { TGitLabConnection } from "@app/services/app-connection/gitlab";
import {
  getGitLabConnectionClient,
  getGitLabInstanceUrl
} from "@app/services/app-connection/gitlab/gitlab-connection-fns";

import { GitLabDataSourceScope } from "./gitlab-secret-scanning-enums";
import {
  TGitLabDataSourceCredentials,
  TGitLabDataSourceInput,
  TGitLabDataSourceWithConnection,
  TQueueGitLabResourceDiffScan
} from "./gitlab-secret-scanning-types";

const PROJECT_HOOK_CONCURRENCY = 5;

type TGitLabProjectHook = { projectId: number; projectName: string; hookId: number };

export const GitLabSecretScanningFactory = ({ appConnectionDAL, kmsService }: TSecretScanningFactoryParams) => {
  type TGitLabClient = Awaited<ReturnType<typeof getGitLabConnectionClient>>;
  type THookableConfig = Exclude<TGitLabDataSourceInput["config"], { scope: GitLabDataSourceScope.Account }>;

  const getHookUrl = () => `${getConfig().SITE_URL}/secret-scanning/webhooks/gitlab`;

  const removeProjectHooks = async (client: TGitLabClient, hooks: TGitLabProjectHook[]) => {
    const limit = pLimit(PROJECT_HOOK_CONCURRENCY);
    await Promise.all(
      hooks.map((hook) =>
        limit(async () => {
          try {
            await client.ProjectHooks.remove(hook.projectId, hook.hookId);
          } catch (error) {
            logger.warn(
              error,
              `secretScanningV2: GitLab - Failed to remove project webhook [projectId=${hook.projectId}] [hookId=${hook.hookId}]`
            );
          }
        })
      )
    );
  };

  // All or nothing: a project left without a hook would silently miss new commit scans.
  const addProjectHooks = async (
    client: TGitLabClient,
    projectNames: string[],
    token: string,
    dataSourceId: string
  ): Promise<TGitLabProjectHook[]> => {
    const limit = pLimit(PROJECT_HOOK_CONCURRENCY);
    const added: TGitLabProjectHook[] = [];
    const failed: string[] = [];

    await Promise.all(
      projectNames.map((projectName) =>
        limit(async () => {
          try {
            const hook: Camelize<ProjectHookSchema> = await client.ProjectHooks.add(projectName, getHookUrl(), {
              token,
              pushEvents: true,
              enableSslVerification: true,
              // @ts-expect-error gitbeaker is outdated, and the types don't support these fields yet
              name: `Infisical Secret Scanning - ${dataSourceId}`,
              custom_headers: [{ key: "x-data-source-id", value: dataSourceId }]
            });
            added.push({ projectId: hook.projectId, projectName, hookId: hook.id });
          } catch (error) {
            const reason =
              error instanceof GitbeakerRequestError
                ? (error.cause?.description ?? error.message)
                : (error as Error)?.message || "Unknown error";
            failed.push(`"${projectName}" (${reason})`);
          }
        })
      )
    );

    if (failed.length) {
      await removeProjectHooks(client, added);
      throw new BadRequestError({
        message: `Could not add a webhook to ${failed.length} GitLab project(s): ${failed.join(", ")}. Scanning new commits needs the connection to have at least the Maintainer role on every included project. Grant that role, remove these projects, or turn off Scan New Commits.`
      });
    }

    return added;
  };

  const removeHook = async (client: TGitLabClient, config: THookableConfig, hookId: number) => {
    try {
      if (config.scope === GitLabDataSourceScope.Project) {
        await client.ProjectHooks.remove(config.projectId, hookId);
      } else {
        await client.GroupHooks.remove(config.groupId, hookId);
      }
    } catch {
      // do nothing, just try to clean up webhook
    }
  };

  const createHook = async (client: TGitLabClient, config: THookableConfig, token: string, name: string) => {
    try {
      if (config.scope === GitLabDataSourceScope.Project) {
        const project = await client.Projects.show(config.projectId);

        if (!project) {
          throw new BadRequestError({ message: `Could not find project with ID ${config.projectId}.` });
        }

        const hook: Camelize<ProjectHookSchema> = await client.ProjectHooks.add(config.projectId, getHookUrl(), {
          token,
          pushEvents: true,
          enableSslVerification: true,
          // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
          name: `Infisical Secret Scanning - ${name}`
        });
        return hook.id;
      }

      const group = await client.Groups.show(config.groupId);

      if (!group) {
        throw new BadRequestError({ message: `Could not find group with ID ${config.groupId}.` });
      }

      const hook: Camelize<GroupHookSchema> = await client.GroupHooks.add(config.groupId, getHookUrl(), {
        token,
        pushEvents: true,
        enableSslVerification: true,
        // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
        name: `Infisical Secret Scanning - ${name}`
      });
      return hook.id;
    } catch (error) {
      if (error instanceof GitbeakerRequestError) {
        throw new BadRequestError({ message: `${error.message}: ${error.cause?.description ?? "Unknown Error"}` });
      }

      throw error;
    }
  };

  // The data source ID only exists after the row is written, so the hook is pointed at it in a second call.
  const bindHookToDataSource = async (
    client: TGitLabClient,
    config: THookableConfig,
    hookId: number,
    dataSourceId: string
  ) => {
    try {
      if (config.scope === GitLabDataSourceScope.Project) {
        await client.ProjectHooks.edit(config.projectId, hookId, getHookUrl(), {
          // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
          name: `Infisical Secret Scanning - ${dataSourceId}`,
          custom_headers: [{ key: "x-data-source-id", value: dataSourceId }]
        });
      } else {
        await client.GroupHooks.edit(config.groupId, hookId, getHookUrl(), {
          // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
          name: `Infisical Secret Scanning - ${dataSourceId}`,
          custom_headers: [{ key: "x-data-source-id", value: dataSourceId }]
        });
      }
    } catch (error) {
      await removeHook(client, config, hookId);
      throw error;
    }
  };

  const initialize: TSecretScanningFactoryInitialize<
    TGitLabDataSourceInput,
    TGitLabConnection,
    TGitLabDataSourceCredentials
  > = async ({ payload, connection }, callback) => {
    const { config, name } = payload;

    if (!isDataSourceWebhookRequired(payload)) return callback({});

    // An account data source starts with no projects; each one gets its hook as it is added.
    if (config.scope === GitLabDataSourceScope.Account) return callback({});

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    const token = alphaNumericNanoId(64);
    const hookId = await createHook(client, config, token, name);

    try {
      return await callback({ credentials: { token, hookId } });
    } catch (error) {
      await removeHook(client, config, hookId);
      throw error;
    }
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<
    TGitLabDataSourceInput,
    TGitLabConnection,
    TGitLabDataSourceCredentials
  > = async ({ connection, dataSourceId, credentials, payload: { config } }) => {
    if (!credentials || !("hookId" in credentials) || config.scope === GitLabDataSourceScope.Account) return;

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    await bindHookToDataSource(client, config, credentials.hookId, dataSourceId);
  };

  const setupWebhook: TSecretScanningFactorySetupWebhook<
    TGitLabDataSourceWithConnection,
    TGitLabDataSourceCredentials
  > = async ({ dataSource: { id, name, connection, config }, resourceNames }) => {
    if (config.scope === GitLabDataSourceScope.Account) {
      if (!resourceNames.length) return undefined;

      const accountClient = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
      const accountToken = alphaNumericNanoId(64);
      const projectHooks = await addProjectHooks(accountClient, resourceNames, accountToken, id);

      return { token: accountToken, projectHooks };
    }

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    const token = alphaNumericNanoId(64);
    const hookId = await createHook(client, config, token, name);
    await bindHookToDataSource(client, config, hookId, id);

    return { token, hookId };
  };

  const updateWebhook: TSecretScanningFactoryUpdateWebhook<
    TGitLabDataSourceWithConnection,
    TGitLabDataSourceCredentials
  > = async ({ dataSource: { id, connection, config }, resourceNames, credentials }) => {
    if (config.scope !== GitLabDataSourceScope.Account || !("projectHooks" in credentials)) return undefined;

    const kept = credentials.projectHooks.filter((hook) => resourceNames.includes(hook.projectName));
    const stale = credentials.projectHooks.filter((hook) => !resourceNames.includes(hook.projectName));
    const missing = resourceNames.filter((projectName) => !kept.some((hook) => hook.projectName === projectName));

    if (!stale.length && !missing.length) return undefined;

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    const added = await addProjectHooks(client, missing, credentials.token, id);

    return {
      credentials: { token: credentials.token, projectHooks: [...kept, ...added] },
      finalize: () => removeProjectHooks(client, stale),
      revert: () => removeProjectHooks(client, added)
    };
  };

  const listRawResources: TSecretScanningFactoryListRawResources<TGitLabDataSourceWithConnection> = async (
    dataSource
  ) => {
    const { connection, config } = dataSource;

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);

    if (config.scope === GitLabDataSourceScope.Project) {
      const { projectId } = config;

      const project = await client.Projects.show(projectId);

      if (!project) {
        throw new BadRequestError({ message: `Could not find project with ID ${projectId}.` });
      }

      // scott: even though we have this data we want to get potentially updated name
      return [
        {
          name: project.pathWithNamespace,
          externalId: project.id.toString()
        }
      ];
    }

    const projects =
      config.scope === GitLabDataSourceScope.Account
        ? await client.Projects.all({ membership: true, archived: false })
        : await client.Groups.allProjects(config.groupId, { archived: false });

    return projects.map(({ id, pathWithNamespace }) => ({
      name: pathWithNamespace,
      externalId: id.toString()
    }));
  };

  const getFullScanPath: TSecretScanningFactoryGetFullScanPath<TGitLabDataSourceWithConnection> = async ({
    dataSource,
    resourceName,
    tempFolder
  }) => {
    const { connection } = dataSource;

    const instanceUrl = await getGitLabInstanceUrl(connection.credentials.instanceUrl);

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);

    const user = await client.Users.showCurrentUser();

    const repoPath = join(tempFolder, "repo.git");

    if (!GitLabProjectRegex.test(resourceName)) {
      throw new Error("Invalid GitLab project name");
    }

    // Checked before the clone: measuring afterwards means the network, wall clock and ephemeral
    // disk have already been spent. `repositorySize` is in bytes and is only returned to callers
    // with sufficient privileges — when it is absent the post-clone check is the backstop.
    await assertProviderRepositorySizeWithinLimit(resourceName, async () => {
      const project = await client.Projects.show(resourceName, { statistics: true });
      return project.statistics?.repositorySize;
    });

    const validatedHostname = new URL(instanceUrl).host;

    await cloneRepository({
      cloneUrl: `https://${user.username}:${connection.credentials.accessToken}@${validatedHostname}/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  const teardown: TSecretScanningFactoryTeardown<
    TGitLabDataSourceWithConnection,
    TGitLabDataSourceCredentials
  > = async ({ dataSource: { connection, config }, credentials }) => {
    if (!credentials) return;

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);

    if ("projectHooks" in credentials) {
      await removeProjectHooks(client, credentials.projectHooks);
      return;
    }

    if (config.scope === GitLabDataSourceScope.Account) return;

    await removeHook(client, config, credentials.hookId);
  };

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueGitLabResourceDiffScan["payload"]
  > = ({ project }) => {
    return {
      name: project.path_with_namespace,
      externalId: project.id.toString()
    };
  };

  const getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<
    TGitLabDataSourceWithConnection,
    TQueueGitLabResourceDiffScan["payload"]
  > = async ({ dataSource, payload, resourceName, configPath }) => {
    const { connection } = dataSource;

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);

    const { commits, project } = payload;

    const allFindings: SecretMatch[] = [];

    for (const commit of commits) {
      // eslint-disable-next-line no-await-in-loop
      const commitDiffs = await client.Commits.showDiff(project.id, commit.id);

      for (const commitDiff of commitDiffs) {
        // eslint-disable-next-line no-continue
        if (commitDiff.deletedFile) continue;

        // eslint-disable-next-line no-await-in-loop
        const findings = await scanContentAndGetFindings(replaceNonChangesWithNewlines(commitDiff.diff), configPath);

        const adjustedFindings = findings.map((finding) => {
          const startLine = convertPatchLineToFileLineNumber(commitDiff.diff, finding.StartLine);
          const endLine =
            finding.StartLine === finding.EndLine
              ? startLine
              : convertPatchLineToFileLineNumber(commitDiff.diff, finding.EndLine);
          const startColumn = finding.StartColumn - 1; // subtract 1 for +
          const endColumn = finding.EndColumn - 1; // subtract 1 for +
          const authorName = commit.author.name;
          const authorEmail = commit.author.email;

          return {
            ...finding,
            StartLine: startLine,
            EndLine: endLine,
            StartColumn: startColumn,
            EndColumn: endColumn,
            File: commitDiff.newPath,
            Commit: commit.id,
            Author: authorName,
            Email: authorEmail,
            Message: commit.message,
            Fingerprint: `${commit.id}:${commitDiff.newPath}:${finding.RuleID}:${startLine}:${startColumn}`,
            Date: commit.timestamp,
            Attributes: {
              ...finding.Attributes,
              url: `https://gitlab.com/${resourceName}/blob/${commit.id}/${commitDiff.newPath}#L${startLine}`
            }
          };
        });

        allFindings.push(...adjustedFindings);
      }
    }

    return {
      findings: allFindings.map((finding) => ({
        details: toFindingDetails(finding),
        fingerprint: finding.Fingerprint,
        severity: SecretScanningFindingSeverity.High,
        rule: finding.RuleID
      }))
    };
  };

  const validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<
    TGitLabDataSourceInput["config"],
    TGitLabDataSourceWithConnection
  > = async ({ config, dataSource }) => {
    if (dataSource.config.scope !== config.scope) {
      throw new BadRequestError({ message: "Cannot change Data Source scope after creation." });
    }
  };

  return {
    listRawResources,
    getFullScanPath,
    initialize,
    postInitialization,
    teardown,
    setupWebhook,
    updateWebhook,
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    validateConfigUpdate
  };
};
