import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GitHubRadarConnectionMethod {
  App = "github-app"
}

export type TGitHubRadarConnection = TRootAppConnection & { app: AppConnection.GitHubRadar } & {
  method: GitHubRadarConnectionMethod.App;
  credentials: {
    code: string;
    installationId: string;
  };
};
