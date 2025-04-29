import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listTeamCityProjects } from "./teamcity-connection-fns";
import { TTeamCityConnection } from "./teamcity-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TTeamCityConnection>;

export const teamcityConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.TeamCity, connectionId, actor);

    try {
      const projects = await listTeamCityProjects(appConnection);
      return projects;
    } catch (error) {
      return [];
    }
  };

  return {
    listProjects
  };
};
