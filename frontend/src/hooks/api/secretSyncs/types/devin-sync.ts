import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TDevinSync = TRootSecretSync & {
  destination: SecretSync.Devin;
  destinationConfig: {
    orgId: string;
  };
  connection: {
    app: AppConnection.Devin;
    name: string;
    id: string;
  };
};
