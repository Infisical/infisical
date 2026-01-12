import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum TriggerDevEnvironment {
  Dev = "dev",
  Staging = "staging",
  Prod = "prod"
}

export type TTriggerDevSync = TRootSecretSync & {
  destination: SecretSync.TriggerDev;
  destinationConfig: {
    projectRef: string;
    environment: TriggerDevEnvironment;
  };
  connection: {
    app: AppConnection.TriggerDev;
    name: string;
    id: string;
  };
};
