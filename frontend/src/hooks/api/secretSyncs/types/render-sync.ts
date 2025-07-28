import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

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

  syncOptions: RootSyncOptions & {
    autoRedeployServices?: boolean;
  };
};

export enum RenderSyncScope {
  Service = "service"
}

export enum RenderSyncType {
  Env = "env",
  File = "file"
}
