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

export type TGitLabPaginatedProjects = {
  items: TGitLabProject[];
  totalCount: number;
  totalPages: number;
  page: number;
};

export type TGitLabListProjectsParams = {
  owned?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
};

export enum GitLabAccessTokenType {
  Personal = "personal",
  Project = "project",
  Group = "group"
}
