export type Workspace = {
  __v: number;
  _id: string;
  name: string;
  organization: string;
  autoCapitalization: boolean;
  environments: WorkspaceEnv[];
};

export type WorkspaceEnv = {
  name: string;
  slug: string;
  isReadDenied: boolean;
  isWriteDenied: boolean;
};

export type WorkspaceTag = { _id: string; name: string; slug: string };

export type NameWorkspaceSecretsDTO = {
  workspaceId: string;
  secretsToUpdate: {
    secretName: string;
    _id: string;
  }[];
}

// mutation dto
export type CreateWorkspaceDTO = {
  workspaceName: string;
  organizationId: string;
};

export type RenameWorkspaceDTO = { workspaceID: string; newWorkspaceName: string };
export type ToggleAutoCapitalizationDTO = { workspaceID: string; state: boolean };

export type DeleteWorkspaceDTO = { workspaceID: string };

export type CreateEnvironmentDTO = {
  workspaceID: string;
  environmentSlug: string;
  environmentName: string;
};

export type ReorderEnvironmentsDTO = {
  workspaceID: string;
  environmentSlug: string;
  environmentName: string;
  otherEnvironmentSlug: string;
  otherEnvironmentName: string;

};

export type UpdateEnvironmentDTO = {
  workspaceID: string;
  oldEnvironmentSlug: string;
  environmentSlug: string;
  environmentName: string;
};

export type DeleteEnvironmentDTO = { workspaceID: string; environmentSlug: string };