import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TRenderSync = TRootSecretSync & {
  destination: SecretSync.Render;
  destinationConfig: {
    scope: RenderSyncScope.Service;
    type: RenderSyncType;
    serviceId: string;
    serviceName?: string;
  };

  connection: {
    app: AppConnection.Render;
    name: string;
    id: string;
  };
};

export enum RenderSyncScope {
  Service = "service"
}

export enum RenderSyncType {
  Env = "env",
  File = "file"
}
