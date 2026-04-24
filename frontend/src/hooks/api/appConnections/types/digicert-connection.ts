import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DigiCertConnectionMethod {
  ApiKey = "api-key"
}

export enum DigiCertRegion {
  US = "us",
  EU = "eu"
}

export type TDigiCertConnection = TRootAppConnection & { app: AppConnection.DigiCert } & {
  method: DigiCertConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    region: DigiCertRegion;
  };
};
