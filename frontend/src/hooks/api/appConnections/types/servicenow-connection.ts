import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ServiceNowConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TServiceNowConnection = TRootAppConnection & { app: AppConnection.ServiceNow } & {
  method: ServiceNowConnectionMethod.BasicAuth;
  credentials: {
    instanceUrl: string;
    username: string;
    password: string;
  };
};
