import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export type TBitBucketDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.BitBucket;
  config: {
    includeRepos: string[];
  };
};

export type TBitBucketDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.BitBucket;
  connection: AppConnection.BitBucket;
};
