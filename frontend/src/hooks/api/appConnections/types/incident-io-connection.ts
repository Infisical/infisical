import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum IncidentIoConnectionMethod {
  ApiKey = "api-key"
}

export type TIncidentIoConnection = TRootAppConnection & { app: AppConnection.IncidentIo } & {
  method: IncidentIoConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
