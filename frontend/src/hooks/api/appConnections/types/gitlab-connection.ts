import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { GitLabAccessTokenType } from "../gitlab";

export enum GitLabConnectionMethod {
  AccessToken = "access-token",
  OAuth = "oauth"
}

export type TGitLabConnection = TRootAppConnection & { app: AppConnection.GitLab } & (
    | {
        method: GitLabConnectionMethod.AccessToken;
        credentials: {
          instanceUrl?: string;
          accessToken: string;
          accessTokenType: GitLabAccessTokenType;
        };
      }
    | {
        method: GitLabConnectionMethod.OAuth;
        credentials: {
          code: string;
          instanceUrl?: string;
        };
      }
  );
