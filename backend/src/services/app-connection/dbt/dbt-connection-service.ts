import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listDbtProjects } from "./dbt-connection-fns";
import { TDbtConnection } from "./dbt-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDbtConnection>;

export const dbtConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Dbt, connectionId, actor);
    const projects = await listDbtProjects(appConnection);
    return projects;
  };

  return {
    listProjects
  };
};
