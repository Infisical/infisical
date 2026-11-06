import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SECRET_SCANNING_DATA_SOURCE_NAME_MAP: Record<SecretScanningDataSource, string> = {
  [SecretScanningDataSource.GitHub]: "GitHub",
  [SecretScanningDataSource.Bitbucket]: "Bitbucket",
  [SecretScanningDataSource.GitLab]: "GitLab",
  [SecretScanningDataSource.ClaudeCode]: "Claude Code"
};

// Data sources without an entry, such as Claude Code, receive their content directly and need no App Connection.
export const SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP: Partial<Record<SecretScanningDataSource, AppConnection>> = {
  [SecretScanningDataSource.GitHub]: AppConnection.GitHubRadar,
  [SecretScanningDataSource.Bitbucket]: AppConnection.Bitbucket,
  [SecretScanningDataSource.GitLab]: AppConnection.GitLab
};

export const AUTO_SYNC_DESCRIPTION_HELPER: Record<SecretScanningDataSource, { verb: string; noun: string }> = {
  [SecretScanningDataSource.GitHub]: { verb: "push", noun: "repositories" },
  [SecretScanningDataSource.Bitbucket]: { verb: "push", noun: "repositories" },
  [SecretScanningDataSource.GitLab]: { verb: "push", noun: "projects" },
  [SecretScanningDataSource.ClaudeCode]: { verb: "submission", noun: "prompts" }
};
