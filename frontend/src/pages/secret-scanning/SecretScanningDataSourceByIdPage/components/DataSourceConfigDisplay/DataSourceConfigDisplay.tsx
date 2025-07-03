import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { BitbucketDataSourceConfigDisplay } from "./BitbucketDataSourceConfigDisplay";
import { GitHubDataSourceConfigDisplay } from "./GitHubDataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const DataSourceConfigDisplay = ({ dataSource }: Props) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.GitHub:
      return <GitHubDataSourceConfigDisplay dataSource={dataSource} />;
    case SecretScanningDataSource.Bitbucket:
      return <BitbucketDataSourceConfigDisplay dataSource={dataSource} />;
    default:
      throw new Error(
        `Unhandled dataSource type ${(dataSource as TSecretScanningDataSource).type}`
      );
  }
};
