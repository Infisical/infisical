import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

export const SECRET_SCANNING_DATA_SOURCE_MAP: Record<
  SecretScanningDataSource,
  { name: string; image: string; size: number }
> = {
  [SecretScanningDataSource.GitHub]: {
    name: "GitHub",
    image: "GitHub.png",
    size: 45
  },
  [SecretScanningDataSource.GitLab]: {
    name: "GitLab",
    image: "GitLab.png",
    size: 45
  }
};

export const SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP: Record<
  SecretScanningDataSource,
  AppConnection
> = {
  [SecretScanningDataSource.GitHub]: AppConnection.GitHub,
  [SecretScanningDataSource.GitLab]: AppConnection.GitLab
};

export const AUTO_SYNC_DESCRIPTION_HELPER: Record<
  SecretScanningDataSource,
  { verb: string; noun: string }
> = {
  [SecretScanningDataSource.GitHub]: { verb: "push", noun: "repositories" },
  [SecretScanningDataSource.GitLab]: { verb: "push", noun: "projects" }
};
