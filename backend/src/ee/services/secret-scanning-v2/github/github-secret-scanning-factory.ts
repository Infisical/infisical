import {
  TSecretScanningFactory,
  TSecretScanningFactoryListRawResources
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";

import { TGitHubDataSourceWithConnection } from "./github-secret-scanning-types";

export const GitHubSecretScanningFactory: TSecretScanningFactory<TGitHubDataSourceWithConnection> = () => {
  const listRawResources: TSecretScanningFactoryListRawResources<TGitHubDataSourceWithConnection> = async (
    dataSource
  ) => {
    const { connection } = dataSource;

    return [{ externalId: "", name: "", type: "" }];
  };

  return {
    listRawResources
  };
};
