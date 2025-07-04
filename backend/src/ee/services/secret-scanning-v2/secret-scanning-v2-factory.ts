import { BitbucketSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/bitbucket/bitbucket-secret-scanning-factory";
import { GitHubSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/github/github-secret-scanning-factory";

import { SecretScanningDataSource } from "./secret-scanning-v2-enums";
import {
  TQueueSecretScanningResourceDiffScan,
  TSecretScanningDataSourceCredentials,
  TSecretScanningDataSourceInput,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningFactory
} from "./secret-scanning-v2-types";

type TSecretScanningFactoryImplementation = TSecretScanningFactory<
  TSecretScanningDataSourceWithConnection,
  TQueueSecretScanningResourceDiffScan["payload"],
  TSecretScanningDataSourceInput,
  TSecretScanningDataSourceCredentials
>;

export const SECRET_SCANNING_FACTORY_MAP: Record<SecretScanningDataSource, TSecretScanningFactoryImplementation> = {
  [SecretScanningDataSource.GitHub]: GitHubSecretScanningFactory as TSecretScanningFactoryImplementation,
  [SecretScanningDataSource.Bitbucket]: BitbucketSecretScanningFactory as TSecretScanningFactoryImplementation
};
