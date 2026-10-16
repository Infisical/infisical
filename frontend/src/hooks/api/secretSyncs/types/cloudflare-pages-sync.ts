import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CloudflarePagesVariableType {
  Secret = "secret_text",
  Text = "plain_text"
}

export type TCloudflarePagesSync = TRootSecretSync & {
  destination: SecretSync.CloudflarePages;
  destinationConfig: {
    projectName: string;
    environment: string;
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
  syncOptions: RootSyncOptions & {
    variableType?: CloudflarePagesVariableType;
  };
};
