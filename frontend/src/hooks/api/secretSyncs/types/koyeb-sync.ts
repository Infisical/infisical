import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TKoyebSync = TRootSecretSync & {
  destination: SecretSync.Koyeb;
  destinationConfig: Record<string, never>;
  connection: {
    app: AppConnection.Koyeb;
    name: string;
    id: string;
  };
};
