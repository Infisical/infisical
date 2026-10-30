import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum DatabricksConnectionMethod {
  ServicePrincipal = "service-principal"
}

export enum DatabricksConnectionScope {
  Secrets = "secrets",
  Authentication = "authentication",
  Scim = "scim"
}

export type TDatabricksConnection = TRootAppConnection & { app: AppConnection.Databricks } & {
  method: DatabricksConnectionMethod.ServicePrincipal;
  credentials: {
    workspaceUrl: string;
    clientId: string;
    clientSecret: string;
    scopes?: DatabricksConnectionScope[];
  };
};
