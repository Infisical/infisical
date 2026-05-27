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

export type TGitLabGroupTreeItem = {
  id: string;
  name: string;
  fullPath: string;
};

export enum GitLabAccessTokenType {
  Personal = "personal",
  Project = "project",
  Group = "group"
}
