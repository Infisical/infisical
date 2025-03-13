import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type THumanitecSync = TRootSecretSync & {
  destination: SecretSync.Humanitec;
  destinationConfig:
    | {
        scope: HumanitecSyncScope.Application;
        org: string;
        app: string;
      }
    | {
        scope: HumanitecSyncScope.Environment;
        org: string;
        app: string;
        env: string;
      };
  connection: {
    app: AppConnection.Humanitec;
    name: string;
    id: string;
  };
};

export enum HumanitecSyncScope {
  Application = "application",
  Environment = "environment"
}
