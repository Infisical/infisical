import { BitbucketSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/bitbucket/bitbucket-secret-scanning-factory";
import { GitHubSecretScanningEventProcessor } from "@app/ee/services/secret-scanning-v2/github/github-secret-scanning-event-processor";
import { GitHubSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/github/github-secret-scanning-factory";
import { GitLabSecretScanningFactory } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-factory";

import { SecretScanningDataSource } from "./secret-scanning-v2-enums";
import {
  TQueueSecretScanningDataSourceEvent,
  TQueueSecretScanningResourceDiffScan,
  TSecretScanningDataSourceCredentials,
  TSecretScanningDataSourceInput,
  TSecretScanningDataSourceWithConnection,
  TSecretScanningEventProcessor,
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
  [SecretScanningDataSource.Bitbucket]: BitbucketSecretScanningFactory as TSecretScanningFactoryImplementation,
  [SecretScanningDataSource.GitLab]: GitLabSecretScanningFactory as TSecretScanningFactoryImplementation
};

// Only providers that receive webhook events beyond pushes have an event processor.
export const SECRET_SCANNING_EVENT_PROCESSOR_MAP: {
  [K in TQueueSecretScanningDataSourceEvent["dataSourceType"]]: TSecretScanningEventProcessor<
    Extract<TQueueSecretScanningDataSourceEvent, { dataSourceType: K }>["event"]
  >;
} = {
  [SecretScanningDataSource.GitHub]: GitHubSecretScanningEventProcessor
};
