import { PushEvent, Repository } from "@octokit/webhooks-types";
import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TGitHubRadarConnection } from "@app/services/app-connection/github-radar";

import { GitHubPullRequestEvent } from "./github-secret-scanning-enums";
import {
  CreateGitHubDataSourceSchema,
  GitHubDataSourceListItemSchema,
  GitHubDataSourceSchema,
  GitHubFindingSchema,
  GitHubPullRequestScanMetadataSchema
} from "./github-secret-scanning-schemas";

export type TGitHubDataSource = z.infer<typeof GitHubDataSourceSchema>;

export type TGitHubDataSourceInput = z.infer<typeof CreateGitHubDataSourceSchema>;

export type TGitHubDataSourceListItem = z.infer<typeof GitHubDataSourceListItemSchema>;

export type TGitHubFinding = z.infer<typeof GitHubFindingSchema>;

export type TGitHubDataSourceWithConnection = TGitHubDataSource & {
  connection: TGitHubRadarConnection;
};

export type TGitHubPullRequestScanMetadata = z.infer<typeof GitHubPullRequestScanMetadataSchema>;

// Carries everything needed to report on the check run, so a scan whose data source was deleted can still close it.
export type TGitHubPullRequestScanPayload = {
  installationId: string;
  repository: Pick<Repository, "id" | "full_name">;
  pullRequest: {
    number: number;
    baseSha: string;
    headSha: string;
  };
  checkRunId: number;
  // The data source's findings page for the repository, linked from the check's summary.
  findingsUrl?: string;
};

export type TQueueGitHubResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.GitHub;
  payload: PushEvent | TGitHubPullRequestScanPayload;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};

export type TGitHubRealtimeScanDetails = {
  scannedCommitCount: number;
  totalCommitCount: number;
};

// Webhook events are reduced to what processing them needs, so the queue never holds GitHub's full payload.
export type TQueueGitHubPullRequestEvent = {
  installationId: number;
  repository: Pick<Repository, "id" | "full_name">;
} & (
  | {
      event: GitHubPullRequestEvent.PullRequest;
      pullRequest: TGitHubPullRequestScanPayload["pullRequest"];
      isFromFork: boolean;
    }
  | { event: GitHubPullRequestEvent.CheckRunRerequested; checkRunId: number; externalId: string | null }
  | { event: GitHubPullRequestEvent.CheckSuiteRerequested; checkSuiteId: number }
  | {
      event: GitHubPullRequestEvent.CheckRunRequestedAction;
      checkRunId: number;
      externalId: string | null;
      action: string;
      sender: { id: number; login: string };
    }
);

export type TQueueGitHubDataSourceEvent = {
  dataSourceType: SecretScanningDataSource.GitHub;
  event: TQueueGitHubPullRequestEvent;
};
