import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DNSMadeEasyConnectionMethod {
  APIKeySecret = "api-key-secret"
}

export type TDNSMadeEasyConnection = TRootAppConnection & { app: AppConnection.DNSMadeEasy } & {
  method: DNSMadeEasyConnectionMethod.APIKeySecret;
  credentials: {
    apiToken: string;
    accountId: string;
  };
};
