import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HumanitecConnectionMethod {
  API_TOKEN = "api-token"
}

export type THumanitecConnection = TRootAppConnection & { app: AppConnection.Humanitec } & {
  method: HumanitecConnectionMethod.API_TOKEN;
  credentials: {
    apiToken: string;
  };
};
