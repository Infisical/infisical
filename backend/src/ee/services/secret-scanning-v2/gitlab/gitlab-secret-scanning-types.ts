import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TGitLabConnection } from "@app/services/app-connection/gitlab";

import {
  CreateGitLabDataSourceSchema,
  GitLabDataSourceCredentialsSchema,
  GitLabDataSourceListItemSchema,
  GitLabDataSourceSchema,
  GitLabFindingSchema
} from "./gitlab-secret-scanning-schemas";

export type TGitLabDataSource = z.infer<typeof GitLabDataSourceSchema>;

export type TGitLabDataSourceInput = z.infer<typeof CreateGitLabDataSourceSchema>;

export type TGitLabDataSourceListItem = z.infer<typeof GitLabDataSourceListItemSchema>;

export type TGitLabFinding = z.infer<typeof GitLabFindingSchema>;

export type TGitLabDataSourceWithConnection = TGitLabDataSource & {
  connection: TGitLabConnection;
};

export type TGitLabDataSourceCredentials = z.infer<typeof GitLabDataSourceCredentialsSchema>;

export type TGitLabDataSourcePushEventPayload = {
  object_kind: "push";
  event_name: "push";
  before: string;
  after: string;
  ref: string;
  ref_protected: boolean;
  checkout_sha: string;
  user_id: number;
  user_name: string;
  user_username: string;
  user_email: string;
  user_avatar: string;
  project_id: number;
  project: {
    id: number;
    name: string;
    description: string;
    web_url: string;
    avatar_url: string | null;
    git_ssh_url: string;
    git_http_url: string;
    namespace: string;
    visibility_level: number;
    path_with_namespace: string;
    default_branch: string;
    homepage: string;
    url: string;
    ssh_url: string;
    http_url: string;
  };
  repository: {
    name: string;
    url: string;
    description: string;
    homepage: string;
    git_http_url: string;
    git_ssh_url: string;
    visibility_level: number;
  };
  commits: {
    id: string;
    message: string;
    title: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
    added: string[];
    modified: string[];
    removed: string[];
  }[];
  total_commits_count: number;
};

export type THandleGitLabPushEvent = {
  payload: TGitLabDataSourcePushEventPayload;
  dataSourceId: string;
  token: string;
};

export type TQueueGitLabResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.GitLab;
  payload: TGitLabDataSourcePushEventPayload;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};
