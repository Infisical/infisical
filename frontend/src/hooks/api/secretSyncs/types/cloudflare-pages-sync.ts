import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

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
};
