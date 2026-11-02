import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ImpervaConnectionMethod {
  ApiKey = "api-key"
}

export type TImpervaConnection = TRootAppConnection & {
  app: AppConnection.Imperva;
} & {
  method: ImpervaConnectionMethod.ApiKey;
  credentials: {
    apiId: string;
    apiKey: string;
    accountId?: string;
  };
};
