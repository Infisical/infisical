import { Camelize, GitbeakerRequestError, GroupHookSchema, ProjectHookSchema } from "@gitbeaker/rest";
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
  TSecretScanningFactoryParams,
  TSecretScanningFactoryPostInitialization,
  TSecretScanningFactoryTeardown,
  TSecretScanningFactoryValidateConfigUpdate
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { titleCaseToCamelCase } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { GitLabProjectRegex } from "@app/lib/regex";
import {
  getGitLabConnectionClient,
  getGitLabInstanceUrl,
  TGitLabConnection
} from "@app/services/app-connection/gitlab";

import { GitLabDataSourceScope } from "./gitlab-secret-scanning-enums";
import {
  TGitLabDataSourceCredentials,
  TGitLabDataSourceInput,
  TGitLabDataSourceWithConnection,
  TQueueGitLabResourceDiffScan
} from "./gitlab-secret-scanning-types";

const getMainDomain = (instanceUrl: string) => {
  const url = new URL(instanceUrl);
  const { hostname } = url;
  const parts = hostname.split(".");

  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  return hostname;
};

export const GitLabSecretScanningFactory = ({ appConnectionDAL, kmsService }: TSecretScanningFactoryParams) => {
  const initialize: TSecretScanningFactoryInitialize<
    TGitLabDataSourceInput,
    TGitLabConnection,
    TGitLabDataSourceCredentials
  > = async ({ payload: { config, name }, connection }, callback) => {
    const token = alphaNumericNanoId(64);

    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    const appCfg = getConfig();

    if (config.scope === GitLabDataSourceScope.Project) {
      const { projectId } = config;
      const project = await client.Projects.show(projectId);

      if (!project) {
        throw new BadRequestError({ message: `Could not find project with ID ${projectId}.` });
      }

      let hook: Camelize<ProjectHookSchema>;
      try {
        hook = await client.ProjectHooks.add(projectId, `${appCfg.SITE_URL}/secret-scanning/webhooks/gitlab`, {
          token,
          pushEvents: true,
          enableSslVerification: true,
          // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
          name: `Infisical Secret Scanning - ${name}`
        });
      } catch (error) {
        if (error instanceof GitbeakerRequestError) {
          throw new BadRequestError({ message: `${error.message}: ${error.cause?.description ?? "Unknown Error"}` });
        }

        throw error;
      }

      try {
        return await callback({
          credentials: {
            token,
            hookId: hook.id
          }
        });
      } catch (error) {
        try {
          await client.ProjectHooks.remove(projectId, hook.id);
        } catch {
          // do nothing, just try to clean up webhook
        }

        throw error;
      }
    }

    // group scope
    const { groupId } = config;

    const group = await client.Groups.show(groupId);

    if (!group) {
      throw new BadRequestError({ message: `Could not find group with ID ${groupId}.` });
    }

    let hook: Camelize<GroupHookSchema>;
    try {
      hook = await client.GroupHooks.add(groupId, `${appCfg.SITE_URL}/secret-scanning/webhooks/gitlab`, {
        token,
        pushEvents: true,
        enableSslVerification: true,
        // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
        name: `Infisical Secret Scanning - ${name}`
      });
    } catch (error) {
      if (error instanceof GitbeakerRequestError) {
        throw new BadRequestError({ message: `${error.message}: ${error.cause?.description ?? "Unknown Error"}` });
      }

      throw error;
    }

    try {
      return await callback({
        credentials: {
          token,
          hookId: hook.id
        }
      });
    } catch (error) {
      try {
        await client.GroupHooks.remove(groupId, hook.id);
      } catch {
        // do nothing, just try to clean up webhook
      }

      throw error;
    }
  };

  const postInitialization: TSecretScanningFactoryPostInitialization<
    TGitLabDataSourceInput,
    TGitLabConnection,
    TGitLabDataSourceCredentials
  > = async ({ connection, dataSourceId, credentials, payload: { config } }) => {
    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);
    const appCfg = getConfig();

    const hookUrl = `${appCfg.SITE_URL}/secret-scanning/webhooks/gitlab`;
    const { hookId } = credentials;

    if (config.scope === GitLabDataSourceScope.Project) {
      const { projectId } = config;

      try {
        await client.ProjectHooks.edit(projectId, hookId, hookUrl, {
          // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
          name: `Infisical Secret Scanning - ${dataSourceId}`,
          custom_headers: [{ key: "x-data-source-id", value: dataSourceId }]
        });
      } catch (error) {
        try {
          await client.ProjectHooks.remove(projectId, hookId);
        } catch {
          // do nothing, just try to clean up webhook
        }

        throw error;
      }

      return;
    }

    // group-scope
    const { groupId } = config;

    try {
      await client.GroupHooks.edit(groupId, hookId, hookUrl, {
        // @ts-expect-error gitbeaker is outdated, and the types don't support this field yet
        name: `Infisical Secret Scanning - ${dataSourceId}`,
        custom_headers: [{ key: "x-data-source-id", value: dataSourceId }]
      });
    } catch (error) {
      try {
        await client.GroupHooks.remove(groupId, hookId);
      } catch {
        // do nothing, just try to clean up webhook
      }

      throw error;
    }
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
          externalId: project.id.toString(),
          type: SecretScanningResource.Project
        }
      ];
    }

    // group-scope

    const { groupId, includeProjects } = config;

    const projects = await client.Groups.allProjects(groupId, {
      archived: false
    });

    const filteredProjects: typeof projects = [];
    if (!includeProjects || includeProjects.includes("*")) {
      filteredProjects.push(...projects);
    } else {
      filteredProjects.push(...projects.filter((project) => includeProjects.includes(project.pathWithNamespace)));
    }

    return filteredProjects.map(({ id, pathWithNamespace }) => ({
      name: pathWithNamespace,
      externalId: id.toString(),
      type: SecretScanningResource.Project
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

    await cloneRepository({
      cloneUrl: `https://${user.username}:${connection.credentials.accessToken}@${getMainDomain(instanceUrl)}/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  const teardown: TSecretScanningFactoryTeardown<
    TGitLabDataSourceWithConnection,
    TGitLabDataSourceCredentials
  > = async ({ dataSource: { connection, config }, credentials: { hookId } }) => {
    const client = await getGitLabConnectionClient(connection, appConnectionDAL, kmsService);

    if (config.scope === GitLabDataSourceScope.Project) {
      const { projectId } = config;
      try {
        await client.ProjectHooks.remove(projectId, hookId);
      } catch (error) {
        // do nothing, just try to clean up webhook
      }
      return;
    }

    const { groupId } = config;
    try {
      await client.GroupHooks.remove(groupId, hookId);
    } catch (error) {
      // do nothing, just try to clean up webhook
    }
  };

  const getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<
    TQueueGitLabResourceDiffScan["payload"]
  > = ({ project }) => {
    return {
      name: project.path_with_namespace,
      externalId: project.id.toString(),
      type: SecretScanningResource.Project
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
        const findings = await scanContentAndGetFindings(
          replaceNonChangesWithNewlines(`\n${commitDiff.diff}`),
          configPath
        );

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
            Link: `https://gitlab.com/${resourceName}/blob/${commit.id}/${commitDiff.newPath}#L${startLine}`
          };
        });

        allFindings.push(...adjustedFindings);
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
    getDiffScanResourcePayload,
    getDiffScanFindingsPayload,
    validateConfigUpdate
  };
};
