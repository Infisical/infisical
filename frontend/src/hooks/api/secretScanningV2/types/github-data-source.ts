import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export type TGitHubDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.GitHub;
  config: {
    includeRepos: string[];
  };
};

export type TGitHubDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.GitHub;
  connection: AppConnection.GitHub;
};
