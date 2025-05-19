import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export type TGitLabDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.GitLab;
  config: {
    includeProjects: string[];
  };
};

export type TGitLabDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.GitLab;
  connection: AppConnection.GitLab;
};
