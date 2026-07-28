import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum SpaceliftConfigType {
  EnvironmentVariable = "environment-variable",
  FileMount = "file-mount"
}

export type TSpaceliftSync = TRootSecretSync & {
  destination: SecretSync.Spacelift;
  destinationConfig: {
    contextId: string;
    contextName: string;
    configType: SpaceliftConfigType;
    mountPath?: string;
  };
  syncOptions: RootSyncOptions & {
    writeOnly?: boolean;
  };
  connection: {
    app: AppConnection.Spacelift;
    name: string;
    id: string;
  };
};
