export type TGitLabProject = {
  id: string;
  name: string;
};

export type TGitLabGroup = {
  id: string;
  fullName: string;
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
