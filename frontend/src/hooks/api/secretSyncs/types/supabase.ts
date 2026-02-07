/* eslint-disable @typescript-eslint/no-empty-object-type */
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TSupabaseSync = TRootSecretSync & {
  destination: SecretSync.Supabase;
  destinationConfig: {
    projectId: string;
    projectName: string;
    projectBranchName?: string;
    projectBranchId?: string;
  };
  connection: {
    app: AppConnection.Supabase;
    name: string;
    id: string;
  };
};
