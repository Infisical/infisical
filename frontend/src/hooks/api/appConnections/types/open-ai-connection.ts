import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OpenAIConnectionMethod {
  ApiKey = "api-key"
}

export type TOpenAIConnection = TRootAppConnection & { app: AppConnection.OpenAI } & {
  method: OpenAIConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
