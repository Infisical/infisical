export type TGitHubRadarConnectionOrganization = {
  login: string;
  id: number;
};

export type TGitHubRadarConnectionRepository = {
  id: number;
  name: string;
  owner: TGitHubRadarConnectionOrganization;
};

export type TGitHubRadarConnectionListRepositoriesResponse = {
  repositories: TGitHubRadarConnectionRepository[];
};
