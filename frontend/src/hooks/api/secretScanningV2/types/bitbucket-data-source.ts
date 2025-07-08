import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export type TBitbucketDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.Bitbucket;
  config: {
    workspaceSlug: string;
    includeRepos: string[];
  };
};

export type TBitbucketDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.Bitbucket;
  connection: AppConnection.Bitbucket;
};
