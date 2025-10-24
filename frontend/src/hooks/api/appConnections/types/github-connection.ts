import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GitHubConnectionMethod {
  App = "github-app",
  OAuth = "oauth",
  Pat = "pat"
}

export type TGitHubConnection = TRootAppConnection & { app: AppConnection.GitHub } & (
    | {
        method: GitHubConnectionMethod.OAuth;
        credentials: {
          code: string;
          instanceType?: "cloud" | "server";
          host?: string;
        };
      }
    | {
        method: GitHubConnectionMethod.App;
        credentials: {
          code: string;
          installationId: string;
          instanceType?: "cloud" | "server";
          host?: string;
        };
      }
    | {
        method: GitHubConnectionMethod.Pat;
        credentials: {
          personalAccessToken: string;
          instanceType?: "cloud" | "server";
          host?: string;
        };
      }
  );
