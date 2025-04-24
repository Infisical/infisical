import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum DatabricksConnectionMethod {
  ServicePrincipal = "service-principal"
}

export type TDatabricksConnection = TRootAppConnection & { app: AppConnection.Databricks } & {
  method: DatabricksConnectionMethod.ServicePrincipal;
  credentials: {
    workspaceUrl: string;
    clientId: string;
    clientSecret: string;
  };
};
