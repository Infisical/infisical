import { DetailGroup } from "@app/components/v3";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { BitbucketDataSourceConfigDisplay } from "./BitbucketDataSourceConfigDisplay";
import { GitLabDataSourceConfigDisplay } from "./GitLabDataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

// which repositories are scanned is managed from the Repositories tab, so only the rest of the config shows here
export const DataSourceConfigDisplay = ({ dataSource }: Props) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.GitHub:
      return null;
    case SecretScanningDataSource.Bitbucket:
      return (
        <DetailGroup>
          <BitbucketDataSourceConfigDisplay dataSource={dataSource} />
        </DetailGroup>
      );
    case SecretScanningDataSource.GitLab:
      return (
        <DetailGroup>
          <GitLabDataSourceConfigDisplay dataSource={dataSource} />
        </DetailGroup>
      );
    default:
      throw new Error(
        `Unhandled dataSource type ${(dataSource as TSecretScanningDataSource).type}`
      );
  }
};
