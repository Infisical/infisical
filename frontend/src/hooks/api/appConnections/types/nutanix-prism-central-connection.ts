import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum NutanixPrismCentralConnectionMethod {
  ApiKey = "api-key",
  BasicAuth = "basic-auth"
}

type TApiKeyCredentials = {
  hostname: string;
  port?: number;
  sslRejectUnauthorized?: boolean;
  sslCertificate?: string;
  apiKey: string;
};

type TBasicAuthCredentials = {
  hostname: string;
  port?: number;
  sslRejectUnauthorized?: boolean;
  sslCertificate?: string;
  username: string;
  password: string;
};

export type TNutanixPrismCentralConnection = TRootAppConnection & {
  app: AppConnection.NutanixPrismCentral;
} & (
    | { method: NutanixPrismCentralConnectionMethod.ApiKey; credentials: TApiKeyCredentials }
    | { method: NutanixPrismCentralConnectionMethod.BasicAuth; credentials: TBasicAuthCredentials }
  );
