import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DigitalOceanConnectionMethod {
  ApiToken = "api-token"
}

export type TDigitalOceanConnection = TRootAppConnection & {
  app: AppConnection.DigitalOcean;
  method: DigitalOceanConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
