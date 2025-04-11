import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum Auth0ConnectionMethod {
  ClientCredentials = "client-credentials"
}

export type TAuth0Connection = TRootAppConnection & {
  app: AppConnection.Auth0;
} & {
  method: Auth0ConnectionMethod.ClientCredentials;
  credentials: {
    domain: string;
    clientId: string;
    audience: string;
  };
};
