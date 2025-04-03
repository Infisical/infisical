import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const TERRAFORM_CLOUD_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Terraform Cloud",
  destination: SecretSync.TerraformCloud,
  connection: AppConnection.TerraformCloud,
  canImportSecrets: false
};
