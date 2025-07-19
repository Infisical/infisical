import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const NETLIFY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Netlify",
  destination: SecretSync.Netlify,
  connection: AppConnection.Netlify,
  canImportSecrets: false
};

export enum NetlifySyncContext {
  All = "all",
  DeployPreview = "deploy-preview",
  Production = "production",
  BranchDeploy = "branch-deploy",
  Dev = "dev",
  Branch = "branch"
}
