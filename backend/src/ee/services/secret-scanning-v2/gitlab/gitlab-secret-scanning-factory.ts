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
      type: SecretScanningResource.Project
    }));
  };

  const getScanPath: TSecretScanningFactoryGetScanPath<TGitLabDataSourceWithConnection> = async (
    dataSource,
    resourcePath
  ) => {
    const { connection } = dataSource;

    const instanceUrl = await getGitLabConnectionUrl(connection);

    const domain = new URL(instanceUrl).hostname;

    const client = await getGitLabConnectionClient(connection);

    const user = await client.Users.showCurrentUser();

    await cloneRepository({
      cloneUrl: `https://${user.username}:${connection.credentials.accessToken}@${domain.replace("www.", "")}/${resourcePath}.git`,
      destinationPath: resourcePath
    });

    return resourcePath;
  };

  return {
    listRawResources,
    getScanPath
  };
};
