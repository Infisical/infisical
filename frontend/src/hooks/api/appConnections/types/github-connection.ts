import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GitHubConnectionMethod {
  App = "github-app",
  OAuth = "oauth"
}

export type TGitHubConnection = TRootAppConnection & { app: AppConnection.GitHub } & (
    | {
        method: GitHubConnectionMethod.OAuth;
        credentials: {
          code: string;
        };
      }
    | {
        method: GitHubConnectionMethod.App;
        credentials: {
          code: string;
          installationId: string;
        };
      }
  );
