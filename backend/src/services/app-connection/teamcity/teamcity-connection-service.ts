import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listTeamCityProjects } from "./teamcity-connection-fns";
import { TTeamCityConnection } from "./teamcity-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TTeamCityConnection>;

export const teamcityConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext) => {
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
