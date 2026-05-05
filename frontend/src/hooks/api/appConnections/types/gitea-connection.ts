import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GiteaConnectionMethod {
  ApiToken = "api-token"
}

export type TGiteaConnection = TRootAppConnection & { app: AppConnection.Gitea } & {
  method: GiteaConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
  };
};
