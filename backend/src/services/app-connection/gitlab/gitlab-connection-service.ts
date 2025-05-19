import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TGitLabConnection } from "./gitlab-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitLabConnection>;

export const gitlabConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listWorkspaces = async (connectionId: string, actor: OrgServiceActor) => {
    // const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
    //
    // try {
    //   const workspaces = await listGitLabWorkspaces(appConnection);
    //   return workspaces;
    // } catch (error) {
    //   return [];
    // }
    return [];
  };

  return {
    listWorkspaces
  };
};
