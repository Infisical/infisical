import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listTravisCIBranches, listTravisCIRepositories } from "./travis-ci-connection-fns";
import { TTravisCIConnection } from "./travis-ci-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TTravisCIConnection>;

export const travisCIConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.TravisCI, connectionId, actor);
    try {
      return await listTravisCIRepositories(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list Travis CI repositories");
      return [];
    }
  };

  const listBranches = async (connectionId: string, repositoryId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.TravisCI, connectionId, actor);
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
