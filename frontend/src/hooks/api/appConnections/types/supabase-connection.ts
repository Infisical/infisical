import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SupabaseConnectionMethod {
  AccessToken = "access-token"
}

export type TSupabaseConnection = TRootAppConnection & {
  app: AppConnection.Supabase;
  method: SupabaseConnectionMethod.AccessToken;
  credentials: {
    instanceUrl?: string;
    accessKey: string;
  };
};
