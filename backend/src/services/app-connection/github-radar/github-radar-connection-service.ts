import { TActorContext } from "@app/domains/lib/actor-context";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { listGitHubRadarRepositories } from "@app/services/app-connection/github-radar/github-radar-connection-fns";
import { TGitHubRadarConnection } from "@app/services/app-connection/github-radar/github-radar-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TGitHubRadarConnection>;

export const githubRadarConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.GitHubRadar, connectionId, actor);

    const repositories = await listGitHubRadarRepositories(appConnection);

    return repositories.map((repo) => ({ id: repo.id, name: repo.full_name }));
  };

  return {
    listRepositories
  };
};
