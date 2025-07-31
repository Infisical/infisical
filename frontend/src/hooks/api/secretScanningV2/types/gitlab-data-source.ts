import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningDataSource } from "../enums";
import { TSecretScanningDataSourceBase } from "./shared";

export enum GitLabDataSourceScope {
  Project = "project",
  Group = "group"
}

export type TGitLabDataSource = TSecretScanningDataSourceBase & {
  type: SecretScanningDataSource.GitLab;
  config:
    | {
        groupId: number;
        groupName?: string;
        includeProjects: string[];
        scope: GitLabDataSourceScope.Group;
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
