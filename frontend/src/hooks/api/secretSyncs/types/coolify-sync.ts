import { CoolifyResourceType } from "@app/hooks/api/appConnections/coolify/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CoolifySyncScope {
  Production = "production",
  Preview = "preview"
}

export type TCoolifySync = TRootSecretSync & {
  destination: SecretSync.Coolify;
  destinationConfig: {
    resourceType: CoolifyResourceType;
    resourceId: string;
    resourceName: string;
    scope: CoolifySyncScope;
  };
  connection: {
    app: AppConnection.Coolify;
    name: string;
    id: string;
  };
};
