import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum JenkinsConnectionMethod {
  ApiToken = "api-token"
}

export type TJenkinsConnection = TRootAppConnection & { app: AppConnection.Jenkins } & {
  method: JenkinsConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
    username: string;
    apiToken: string;
  };
};
