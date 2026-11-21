import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum DenoDeploySyncContext {
  Production = "production",
  Preview = "preview",
  Build = "build",
  All = "all"
}

export const DENO_DEPLOY_SYNC_CONTEXT_OPTIONS = [
  { value: DenoDeploySyncContext.Production, label: "Production" },
  { value: DenoDeploySyncContext.Preview, label: "Preview" },
  { value: DenoDeploySyncContext.Build, label: "Build" },
  { value: DenoDeploySyncContext.All, label: "All" }
] as const;

export type TDenoDeploySync = TRootSecretSync & {
  destination: SecretSync.DenoDeploy;
  destinationConfig: {
    appId: string;
    appSlug: string;
    context: DenoDeploySyncContext;
  };
  connection: {
    app: AppConnection.DenoDeploy;
    name: string;
    id: string;
  };
};
