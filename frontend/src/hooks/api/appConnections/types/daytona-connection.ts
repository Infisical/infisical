import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DaytonaConnectionMethod {
  ApiKey = "api-key"
}

export type TDaytonaConnection = TRootAppConnection & { app: AppConnection.Daytona } & {
  method: DaytonaConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
