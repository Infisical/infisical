import { z } from "zod";

import { RenderSyncDestinationSchema } from "@app/components/secret-syncs/forms/schemas/render-sync-destination-schema";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TRenderSync = TRootSecretSync & {
  destination: SecretSync.Render;
  destinationConfig: z.infer<typeof RenderSyncDestinationSchema>["destinationConfig"];

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
