import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export enum GitLabDataSourceScope {
  Account = "account",
  // Only existing data sources use project scope; new ones pick a group or none.
  Project = "project",
  Group = "group"
}

export type TGitLabDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.GitLab;
  config:
    | {
        groupId: number;
        groupName?: string;
        scope: GitLabDataSourceScope.Group;
      }
    | {
        scope: GitLabDataSourceScope.Account;
      }
    | {
        projectName?: string;
        projectId: number;
        scope: GitLabDataSourceScope.Project;
      };
};

export type TGitLabDataSourceOption = {
  name: string;
  type: SecretScanningDataSource.GitLab;
  connection: AppConnection.GitLab;
};
