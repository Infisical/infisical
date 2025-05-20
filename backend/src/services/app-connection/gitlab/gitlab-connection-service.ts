import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listGitLabConnectionProjects } from "./gitlab-connection-fns";
import { TGitLabConnection } from "./gitlab-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitLabConnection>;

export const gitlabConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);

    try {
      const projects = await listGitLabConnectionProjects(appConnection);
      return projects;
    } catch (error) {
      logger.error(error, "Error fetching GitLab Projects");
      return [];
    }
  };

  return {
    listProjects
  };
};
