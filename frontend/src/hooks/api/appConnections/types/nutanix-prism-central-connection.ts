import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum NutanixPrismCentralConnectionMethod {
  ApiKey = "api-key",
  BasicAuth = "basic-auth"
}

type TApiKeyCredentials = {
  hostname: string;
  port?: number;
  sslRejectUnauthorized?: boolean;
  apiKey: string;
};

type TBasicAuthCredentials = {
  hostname: string;
  port?: number;
  sslRejectUnauthorized?: boolean;
  username: string;
};

export type TNutanixPrismCentralConnection = TRootAppConnection & {
  app: AppConnection.NutanixPrismCentral;
} & (
    | { method: NutanixPrismCentralConnectionMethod.ApiKey; credentials: TApiKeyCredentials }
    | { method: NutanixPrismCentralConnectionMethod.BasicAuth; credentials: TBasicAuthCredentials }
  );
