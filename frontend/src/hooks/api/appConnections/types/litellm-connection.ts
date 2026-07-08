import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum LiteLLMConnectionMethod {
  ApiKey = "api-key"
}

export type TLiteLLMConnection = TRootAppConnection & { app: AppConnection.LiteLLM } & {
  method: LiteLLMConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    instanceUrl: string;
  };
};
