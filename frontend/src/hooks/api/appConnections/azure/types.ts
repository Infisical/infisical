export type TAzureClient = {
  name: string;
  appId: string;
  id: string;
};

export interface AzureDevOpsProject {
  id: string;
  name: string;
  appId: string;
}

export interface AzureDevOpsProjectsResponse {
  projects: AzureDevOpsProject[];
}

export type TAzureScimServicePrincipal = {
  id: string;
  displayName: string;
  appId: string;
};
