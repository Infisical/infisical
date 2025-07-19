import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OktaConnectionMethod {
  ApiToken = "api-token"
}

export type TOktaConnection = TRootAppConnection & { app: AppConnection.Okta } & {
  method: OktaConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
    apiToken: string;
  };
};
