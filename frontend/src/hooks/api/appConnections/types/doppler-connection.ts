import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DopplerConnectionMethod {
  ApiToken = "api-token"
}

export type TDopplerConnection = TRootAppConnection & { app: AppConnection.Doppler } & {
  method: DopplerConnectionMethod.ApiToken;
  credentials: Record<string, never>; // sanitized — no credentials returned
};
