import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TSecretScanningDataSourceListItem } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const BITBUCKET_SECRET_SCANNING_DATA_SOURCE_LIST_OPTION: TSecretScanningDataSourceListItem = {
  name: "Bitbucket",
  type: SecretScanningDataSource.Bitbucket,
  connection: AppConnection.Bitbucket
};
