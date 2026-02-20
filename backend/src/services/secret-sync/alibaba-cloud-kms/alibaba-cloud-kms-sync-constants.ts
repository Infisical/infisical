import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const ALIBABA_CLOUD_KMS_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Alibaba Cloud KMS",
  destination: SecretSync.AlibabaCloudKMS,
  connection: AppConnection.AlibabaCloud,
  canImportSecrets: true
};
