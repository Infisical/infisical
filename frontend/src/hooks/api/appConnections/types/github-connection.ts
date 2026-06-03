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
          // omitted in the already-installed app flow — the backend resolves the installation
          // from the authorizing user's access
          installationId?: string;
          gitHubAppId?: string | null;
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
