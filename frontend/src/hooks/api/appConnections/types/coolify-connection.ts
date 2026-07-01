import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum CoolifyConnectionMethod {
  ApiToken = "api-token"
}

export type TCoolifyConnection = TRootAppConnection & {
  app: AppConnection.Coolify;
} & {
  method: CoolifyConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    instanceUrl: string;
  };
};
