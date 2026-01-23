import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listCircleCIProjects } from "./circleci-connection-fns";
import { TCircleCIConnection } from "./circleci-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCircleCIConnection>;

export const circleciConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.CircleCI, connectionId, actor);
    const projects = await listCircleCIProjects(appConnection);
    return projects;
  };

  return {
    listProjects
  };
};
