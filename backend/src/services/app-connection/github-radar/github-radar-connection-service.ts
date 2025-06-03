import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { listGitHubRadarRepositories } from "@app/services/app-connection/github-radar/github-radar-connection-fns";
import { TGitHubRadarConnection } from "@app/services/app-connection/github-radar/github-radar-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitHubRadarConnection>;

export const githubRadarConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitHubRadar, connectionId, actor);

    const repositories = await listGitHubRadarRepositories(appConnection);

    return repositories.map((repo) => ({ id: repo.id, name: repo.full_name }));
  };

  return {
    listRepositories
  };
};
