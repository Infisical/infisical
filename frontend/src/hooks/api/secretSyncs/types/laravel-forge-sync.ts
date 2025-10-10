import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TLaravelForgeSync = TRootSecretSync & {
  destination: SecretSync.LaravelForge;
  destinationConfig: {
    orgSlug: string;
    serverId: string;
    siteId: string;
  };
  connection: {
    app: AppConnection.LaravelForge;
    name: string;
    id: string;
  };
};
