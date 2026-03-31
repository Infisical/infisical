import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { getDopplerSecrets, listDopplerEnvironments, listDopplerProjects } from "./doppler-connection-fns";
import { TDopplerConnection } from "./doppler-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDopplerConnection>;

export const dopplerConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Doppler, connectionId, actor);
    try {
      return await listDopplerProjects(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list projects for Doppler connection");
      return [];
    }
  };

  const listEnvironments = async (connectionId: string, projectSlug: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Doppler, connectionId, actor);
    try {
      return await listDopplerEnvironments(appConnection, projectSlug);
    } catch (error) {
      logger.error(error, "Failed to list environments for Doppler connection");
      return [];
    }
  };

  const getSecrets = async (
    connectionId: string,
    projectSlug: string,
    environmentSlug: string,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.Doppler, connectionId, actor);
    return getDopplerSecrets(appConnection, projectSlug, environmentSlug);
  };

  return { listProjects, listEnvironments, getSecrets };
};
