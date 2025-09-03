import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TRenderSync = TRootSecretSync & {
  destination: SecretSync.Render;
  destinationConfig:
    | {
        type: RenderSyncType;
        scope: RenderSyncScope.Service;
        serviceId: string;
        serviceName?: string | undefined;
      }
    | {
        type: RenderSyncType;
        scope: RenderSyncScope.EnvironmentGroup;
        environmentGroupId: string;
        environmentGroupName?: string | undefined;
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
  Service = "service",
  EnvironmentGroup = "environment-group"
}

export enum RenderSyncType {
  Env = "env",
  File = "file"
}
