import { GitHubSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/github/github-secret-scanning-factory";

import { SecretScanningDataSource } from "./secret-scanning-v2-enums";
import {
  TQueueSecretScanningResourceDiffScan,
  TSecretScanningDataSourceCredentials,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningFactory
} from "./secret-scanning-v2-types";

type TSecretScanningFactoryImplementation = TSecretScanningFactory<
  TSecretScanningDataSourceWithConnection,
  TSecretScanningDataSourceCredentials,
  TQueueSecretScanningResourceDiffScan["payload"]
>;

export const SECRET_SCANNING_FACTORY_MAP: Record<SecretScanningDataSource, TSecretScanningFactoryImplementation> = {
  [SecretScanningDataSource.GitHub]: GitHubSecretScanningFactory as TSecretScanningFactoryImplementation
};
