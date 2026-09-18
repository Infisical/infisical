import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SpaceliftConnectionMethod {
  ApiKeySecret = "api-key-secret"
}

export type TSpaceliftConnection = TRootAppConnection & { app: AppConnection.Spacelift } & {
  method: SpaceliftConnectionMethod.ApiKeySecret;
  credentials: {
    apiUrl: string;
    apiKeyId: string;
    apiKeySecret: string;
  };
};
