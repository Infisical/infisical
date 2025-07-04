import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listBitbucketRepositories, listBitbucketWorkspaces } from "./bitbucket-connection-fns";
import { TBitbucketConnection, TGetBitbucketRepositoriesDTO } from "./bitbucket-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TBitbucketConnection>;

export const bitbucketConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listWorkspaces = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Bitbucket, connectionId, actor);
    const workspaces = await listBitbucketWorkspaces(appConnection);
    return workspaces;
  };

  const listRepositories = async (
    { connectionId, workspaceSlug }: TGetBitbucketRepositoriesDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.Bitbucket, connectionId, actor);
    const repositories = await listBitbucketRepositories(appConnection, workspaceSlug);
    return repositories;
  };

  return {
    listWorkspaces,
    listRepositories
  };
};
