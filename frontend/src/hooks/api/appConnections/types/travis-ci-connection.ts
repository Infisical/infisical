import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TravisCIConnectionMethod {
  ApiToken = "api-token"
}

export type TTravisCIConnection = TRootAppConnection & { app: AppConnection.TravisCI } & {
  method: TravisCIConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
