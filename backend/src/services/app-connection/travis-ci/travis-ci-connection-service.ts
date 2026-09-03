import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listTravisCIBranches, listTravisCIRepositories } from "./travis-ci-connection-fns";
import { TTravisCIConnection } from "./travis-ci-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TTravisCIConnection>;

export const travisCIConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.TravisCI, connectionId, actor);
    if (process.env.NODE_ENV === "development" && appConnection.credentials.apiToken === "local-travis-ci-fixture") {
      return [{ id: "local-travis-ci-repository", name: "Local Preview", slug: "infisical/local-preview" }];
    }

    try {
      return await listTravisCIRepositories(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list Travis CI repositories");
      return [];
    }
  };

  const listBranches = async (connectionId: string, repositoryId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.TravisCI, connectionId, actor);
    if (
      process.env.NODE_ENV === "development" &&
      appConnection.credentials.apiToken === "local-travis-ci-fixture" &&
      repositoryId === "local-travis-ci-repository"
    ) {
      return [
        { name: "main", isDefault: true },
        { name: "feature/combobox-migration", isDefault: false }
      ];
    }

    try {
      return await listTravisCIBranches(appConnection, repositoryId);
    } catch (error) {
      logger.error(error, "Failed to list Travis CI branches");
      return [];
    }
  };

  return {
    listRepositories,
    listBranches
  };
};
