import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listQoveryEnvironments, listQoveryOrganizations, listQoveryProjects } from "./qovery-connection-fns";
import { TQoveryConnection } from "./qovery-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TQoveryConnection>;

export const qoveryConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Qovery, connectionId, actor);
    try {
      return await listQoveryOrganizations(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list organizations for Qovery connection");
      return [];
    }
  };

  const listProjects = async (connectionId: string, organizationId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Qovery, connectionId, actor);
    try {
      return await listQoveryProjects(appConnection, organizationId);
    } catch (error) {
      logger.error(error, "Failed to list projects for Qovery connection");
      return [];
    }
  };

  const listEnvironments = async (connectionId: string, projectId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Qovery, connectionId, actor);
    try {
      return await listQoveryEnvironments(appConnection, projectId);
    } catch (error) {
      logger.error(error, "Failed to list environments for Qovery connection");
      return [];
    }
  };

  return {
    listOrganizations,
    listProjects,
    listEnvironments
  };
};
