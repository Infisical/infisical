import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum SpaceliftConfigType {
  EnvironmentVariable = "environment-variable",
  FileMount = "file-mount"
}

export enum SpaceliftFileMountFormat {
  DotEnv = "dot-env",
  SecretPerFile = "secret-per-file"
}

export type TSpaceliftSync = TRootSecretSync & {
  destination: SecretSync.Spacelift;
  destinationConfig: {
    contextId: string;
    contextName: string;
    configType: SpaceliftConfigType;
    mountPath?: string;
    fileMountFormat?: SpaceliftFileMountFormat;
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
