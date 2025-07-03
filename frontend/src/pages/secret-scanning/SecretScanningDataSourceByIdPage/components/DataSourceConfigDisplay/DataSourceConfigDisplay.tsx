import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { GitHubDataSourceConfigDisplay } from "./GitHubDataSourceConfigDisplay";
import { BitBucketDataSourceConfigDisplay } from "./BitBucketDataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const DataSourceConfigDisplay = ({ dataSource }: Props) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.GitHub:
      return <GitHubDataSourceConfigDisplay dataSource={dataSource} />;
    case SecretScanningDataSource.BitBucket:
      return <BitBucketDataSourceConfigDisplay dataSource={dataSource} />;
    default:
      throw new Error(
        `Unhandled dataSource type ${(dataSource as TSecretScanningDataSource).type}`
      );
  }
};
