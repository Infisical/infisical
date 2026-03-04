import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OpenRouterConnectionMethod {
  ApiKey = "api-key"
}

export type TOpenRouterConnection = TRootAppConnection & { app: AppConnection.OpenRouter } & {
  method: OpenRouterConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
