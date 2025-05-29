import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SECRET_SCANNING_DATA_SOURCE_NAME_MAP: Record<SecretScanningDataSource, string> = {
  [SecretScanningDataSource.GitHub]: "GitHub"
};

export const SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP: Record<SecretScanningDataSource, AppConnection> = {
  [SecretScanningDataSource.GitHub]: AppConnection.GitHubRadar
};

export const AUTO_SYNC_DESCRIPTION_HELPER: Record<SecretScanningDataSource, { verb: string; noun: string }> = {
  [SecretScanningDataSource.GitHub]: { verb: "push", noun: "repositories" }
};
