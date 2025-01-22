export type TGitHubConnectionOrganization = {
  login: string;
  id: number;
};

export type TGitHubConnectionRepository = {
  id: number;
  name: string;
  owner: TGitHubConnectionOrganization;
};

export type TGitHubConnectionEnvironment = {
  id: number;
  name: string;
};

export type TGitHubConnectionListRepositoriesResponse = {
  repositories: TGitHubConnectionRepository[];
};

export type TGitHubConnectionListOrganizationsResponse = {
  organizations: TGitHubConnectionOrganization[];
};

export type TGitHubConnectionListEnvironmentsResponse = {
  environments: TGitHubConnectionEnvironment[];
};

export type TListGitHubConnectionEnvironments = {
  connectionId: string;
  repo: string;
  owner: string;
};
