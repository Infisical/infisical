import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RipplingConnectionMethod {
  ApiToken = "api-token"
}

export type TRipplingConnection = TRootAppConnection & { app: AppConnection.Rippling } & {
  method: RipplingConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
