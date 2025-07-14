import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SupabaseConnectionMethod {
  AccountToken = "account-token"
}

export type TSupabaseConnection = TRootAppConnection & {
  app: AppConnection.Supabase;
  method: SupabaseConnectionMethod.AccountToken;
  credentials: {
    instanceUrl: string;
    apiKey: string;
  };
};
