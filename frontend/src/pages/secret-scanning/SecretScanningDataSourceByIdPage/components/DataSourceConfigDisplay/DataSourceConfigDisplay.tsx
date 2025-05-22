import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { GitLabConfigDisplay } from "./GitLabConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const DataSourceConfigDisplay = ({ dataSource }: Props) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.GitLab:
      return <GitLabConfigDisplay dataSource={dataSource} />;
    default:
      throw new Error(`Unhandled dataSource type ${dataSource.type as SecretScanningDataSource}`);
  }
};
