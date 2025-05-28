import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningDataSourceListItem } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const GITHUB_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION: TSecretScanningDataSourceListItem = {
  name: "GitHub",
  type: SecretScanningDataSource.GitHub,
  connection: AppConnection.GitHub
};

// TODO: figure out why I need to prefix /api
export const SECRET_SCANNING_WEBHOOK_PATH = "/secret-scanning/webhooks";
// https://bubblegloop-swamp.ngrok.dev/secret-scanning/webhooks/gitlab
