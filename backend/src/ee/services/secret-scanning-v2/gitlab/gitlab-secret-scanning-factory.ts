import { join } from "path";

import { SecretScanningResource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { cloneRepository } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-fns";
import {
  TSecretScanningFactory,
  TSecretScanningFactoryGetScanPath,
  TSecretScanningFactoryListRawResources
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import {
  getGitLabConnectionClient,
  getGitLabConnectionUrl,
  listGitLabConnectionProjects
} from "@app/services/app-connection/gitlab";

import { TGitLabDataSourceWithConnection } from "./gitlab-secret-scanning-types";

const getMainDomain = (instanceUrl: string) => {
  const url = new URL(instanceUrl);
  const { hostname } = url;
  const parts = hostname.split(".");

  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  return hostname;
};

export const GitLabSecretScanningFactory: TSecretScanningFactory<TGitLabDataSourceWithConnection> = () => {
  const listRawResources: TSecretScanningFactoryListRawResources<TGitLabDataSourceWithConnection> = async (
    dataSource
  ) => {
    const {
      connection,
      config: { includeProjects }
    } = dataSource;

    const projects = await listGitLabConnectionProjects(connection);

    const filteredProjects: typeof projects = [];
    if (!includeProjects || includeProjects.includes("*")) {
      filteredProjects.push(...projects);
    } else {
      filteredProjects.push(...projects.filter((project) => includeProjects.includes(project.name)));
    }

    return filteredProjects.map(({ name, id, namespace }) => ({
      name: `${namespace.fullPath}/${name}`,
      externalId: id.toString(),
      type: SecretScanningResource.Repository
    }));
  };

  const getScanPath: TSecretScanningFactoryGetScanPath<TGitLabDataSourceWithConnection> = async ({
    dataSource,
    resourceName,
    tempFolder
  }) => {
    const { connection } = dataSource;

    const instanceUrl = await getGitLabConnectionUrl(connection);

    const client = await getGitLabConnectionClient(connection);

    const user = await client.Users.showCurrentUser();

    const repoPath = join(tempFolder, "repo.git");

    await cloneRepository({
      // TODO: test main domain with self-hosted
      cloneUrl: `https://${user.username}:${connection.credentials.accessToken}@${getMainDomain(instanceUrl)}/${resourceName}.git`,
      repoPath
    });

    return repoPath;
  };

  return {
    listRawResources,
    getScanPath
  };
};
