export type TGitLabConnectionProject = {
  name: string;
  id: number;
};

export type TGitLabConnectionListProjectsResponse = {
  projects: TGitLabConnectionProject[];
};
