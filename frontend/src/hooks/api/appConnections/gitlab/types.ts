export type TGitLabConnectionProject = {
  pathWithNamespace: string;
  id: number;
};

export type TGitLabConnectionListProjectsResponse = {
  projects: TGitLabConnectionProject[];
};
