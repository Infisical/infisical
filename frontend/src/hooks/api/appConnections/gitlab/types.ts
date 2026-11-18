export type TGitLabProject = {
  id: string;
  name: string;
};

export type TGitLabGroup = {
  id: string;
  name: string;
  fullName: string;
  fullPath: string;
};

export type TGitLabServiceAccount = {
  id: string;
  username: string;
  name: string;
};

export enum GitLabAccessTokenType {
  Personal = "personal",
  Project = "project",
  Group = "group"
}
