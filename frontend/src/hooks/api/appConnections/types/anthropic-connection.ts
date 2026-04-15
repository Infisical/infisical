import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AnthropicConnectionMethod {
  ApiKey = "api-key"
}

export type TAnthropicConnection = TRootAppConnection & { app: AppConnection.Anthropic } & {
  method: AnthropicConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
