import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DbtConnectionMethod {
  ApiToken = "api-token"
}

export type TDbtConnection = TRootAppConnection & {
  app: AppConnection.Dbt;
  method: DbtConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    instanceUrl: string;
    accountId: string;
  };
};
