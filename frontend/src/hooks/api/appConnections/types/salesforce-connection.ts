import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum SalesforceConnectionMethod {
  ClientCredentials = "client-credentials"
}

export type TSalesforceConnection = TRootAppConnection & {
  app: AppConnection.Salesforce;
} & {
  method: SalesforceConnectionMethod.ClientCredentials;
  credentials: {
    instanceUrl: string;
  };
};
