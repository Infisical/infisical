import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum CamundaConnectionMethod {
  ClientCredentials = "client-credentials"
}

export type TCamundaConnection = TRootAppConnection & { app: AppConnection.Camunda } & {
  method: CamundaConnectionMethod.ClientCredentials;
  credentials: {
    clientId: string;
    clientSecret: string;
  };
};
