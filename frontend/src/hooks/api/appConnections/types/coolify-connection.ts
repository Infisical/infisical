import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum CoolifyConnectionMethod {
  ApiToken = "api-token"
}

export type TCoolifyConnection = TRootAppConnection & { app: AppConnection.Coolify } & {
  method: CoolifyConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
    apiToken: string;
  };
};
