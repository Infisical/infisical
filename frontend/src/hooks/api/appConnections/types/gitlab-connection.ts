import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GitlabConnectionMethod {
  AccessToken = "access-token",
  OAuth = "oauth"
}

export type TGitlabConnection = TRootAppConnection & { app: AppConnection.Gitlab } & (
    | {
        method: GitlabConnectionMethod.AccessToken;
        credentials: {
          instanceUrl?: string;
          accessToken: string;
        };
      }
    | {
        method: GitlabConnectionMethod.OAuth;
        credentials: {
          code: string;
          instanceUrl?: string;
        };
      }
  );
