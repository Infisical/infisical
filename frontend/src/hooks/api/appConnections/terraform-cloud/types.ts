export type TTerraformCloudOrganization = {
  name: string;
  id: string;
  projects: TTerraformCloudProject[];
  workspaces: TTerraformCloudWorkspace[];
};

export type TTerraformCloudProject = {
  id: string;
  name: string;
};

export type TTerraformCloudWorkspace = {
  id: string;
  name: string;
};

export type TTerraformCloudConnectionOrganization = {
  id: string;
  name: string;
  projects: TTerraformCloudConnectionProject[];
  workspaces: TTerraformCloudConnectionWorkspace[];
};

export type TTerraformCloudConnectionProject = {
  id: string;
  name: string;
};

export type TTerraformCloudConnectionWorkspace = {
  id: string;
  name: string;
};

export enum TerraformCloudSyncScope {
  Project = "project",
  Workspace = "workspace"
}

export const TERRAFORM_CLOUD_SYNC_SCOPES = {
  [TerraformCloudSyncScope.Project]: {
    name: "Project",
    description: "Sync secrets to a specific project in Terraform Cloud."
  },
  [TerraformCloudSyncScope.Workspace]: {
    name: "Workspace",
    description: "Sync secrets to a specific workspace in Terraform Cloud."
  }
};
