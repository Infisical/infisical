import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CloudflarePagesVariableType {
  Secret = "secret_text",
  Text = "plain_text"
}

export type TCloudflarePagesSync = TRootSecretSync & {
  destination: SecretSync.CloudflarePages;
  destinationConfig: {
    projectName: string;
    environment: string;
    variableType?: CloudflarePagesVariableType;
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
};
