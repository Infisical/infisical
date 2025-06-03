import { PushEvent } from "@octokit/webhooks-types";
import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TGitHubRadarConnection } from "@app/services/app-connection/github-radar";

import {
  CreateGitHubDataSourceSchema,
  GitHubDataSourceListItemSchema,
  GitHubDataSourceSchema,
  GitHubFindingSchema
} from "./github-secret-scanning-schemas";

export type TGitHubDataSource = z.infer<typeof GitHubDataSourceSchema>;

export type TGitHubDataSourceInput = z.infer<typeof CreateGitHubDataSourceSchema>;

export type TGitHubDataSourceListItem = z.infer<typeof GitHubDataSourceListItemSchema>;

export type TGitHubFinding = z.infer<typeof GitHubFindingSchema>;

export type TGitHubDataSourceWithConnection = TGitHubDataSource & {
  connection: TGitHubRadarConnection;
};

export type TQueueGitHubResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.GitHub;
  payload: PushEvent;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};
