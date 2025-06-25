export type TGitLabProject = {
  id: string;
  name: string;
};

export type TGitLabGroup = {
  id: string;
  name: string;
};

export enum GitLabAccessTokenType {
  Personal = "personal",
  Project = "project"
}
