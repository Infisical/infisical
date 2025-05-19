import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GitLabConnectionMethod {
  AccessToken = "access-token"
}

export type TGitLabConnection = TRootAppConnection & { app: AppConnection.GitLab } & {
  method: GitLabConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
    instanceUrl?: string;
  };
};
