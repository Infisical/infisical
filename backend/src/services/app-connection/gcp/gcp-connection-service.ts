import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { getGcpSecretManagerProjectLocations, getGcpSecretManagerProjects } from "./gcp-connection-fns";
import { TGcpConnection, TGetGCPProjectLocationsDTO } from "./gcp-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGcpConnection>;

export const gcpConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listSecretManagerProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const projects = await getGcpSecretManagerProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(error, "Error listing GCP secret manager projects");
      return [];
    }
  };

  const listSecretManagerProjectLocations = async (
    { connectionId, projectId }: TGetGCPProjectLocationsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GCP, connectionId, actor);

    try {
      const locations = await getGcpSecretManagerProjectLocations(projectId, appConnection);

      return locations;
    } catch (error) {
      return [];
    }
  };

  return {
    listSecretManagerProjects,
    listSecretManagerProjectLocations
  };
};
