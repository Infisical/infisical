import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum CircleCIConnectionMethod {
  ApiToken = "api-token"
}

export type TCircleCIConnection = TRootAppConnection & { app: AppConnection.CircleCI } & {
  method: CircleCIConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    host?: string;
  };
};
