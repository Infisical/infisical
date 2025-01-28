import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { getGcpSecretManagerProjects } from "./gcp-connection-fns";
import { TGcpConnection } from "./gcp-connection-types";

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
      return [];
    }
  };

  return {
    listSecretManagerProjects
  };
};
