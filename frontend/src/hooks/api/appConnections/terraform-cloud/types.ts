export type TTerraformCloudOrganization = {
  name: string;
  id: string;
  variableSets: TTerraformCloudVariableSet[];
  workspaces: TTerraformCloudWorkspace[];
};

export type TTerraformCloudVariableSet = {
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
  variableSets: TTerraformCloudConnectionVariableSet[];
  workspaces: TTerraformCloudConnectionWorkspace[];
};

export type TTerraformCloudConnectionVariableSet = {
  id: string;
  name: string;
  description: string;
  global: boolean;
};

export type TTerraformCloudConnectionWorkspace = {
  id: string;
  name: string;
};

export enum TerraformCloudSyncScope {
  VariableSet = "variable-set",
  Workspace = "workspace"
}

export enum TerraformCloudSyncCategory {
  Environment = "env",
  Terraform = "terraform"
}

export const TERRAFORM_CLOUD_SYNC_SCOPES = {
  [TerraformCloudSyncScope.VariableSet]: {
    name: "Variable Set",
    description: "Sync secrets to a specific variable set in Terraform Cloud."
  },
  [TerraformCloudSyncScope.Workspace]: {
    name: "Workspace",
    description: "Sync secrets to a specific workspace in Terraform Cloud."
  }
};
