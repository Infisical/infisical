export type Workspace = {
  __v: number;
  id: string;
  name: string;
  orgId: string;
  e2ee: boolean;
  autoCapitalization: boolean;
  environments: WorkspaceEnv[];
};

export type WorkspaceEnv = {
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceTag = { id: string; name: string; slug: string };

export type NameWorkspaceSecretsDTO = {
  workspaceId: string;
  secretsToUpdate: {
    secretName: string;
    secretId: string;
  }[];
};

// mutation dto
export type CreateWorkspaceDTO = {
  projectName: string;
  organizationId: string;
};

export type RenameWorkspaceDTO = { workspaceID: string; newWorkspaceName: string };
export type ToggleAutoCapitalizationDTO = { workspaceID: string; state: boolean };

export type DeleteWorkspaceDTO = { workspaceID: string };

export type CreateEnvironmentDTO = {
  workspaceId: string;
  name: string;
  slug: string;
};

export type ReorderEnvironmentsDTO = {
  workspaceId: string;
  environmentSlug: string;
  environmentName: string;
  otherEnvironmentSlug: string;
  otherEnvironmentName: string;
};

export type UpdateEnvironmentDTO = {
  workspaceId: string;
  id: string;
  name?: string;
  slug?: string;
  position?: number;
};

export type DeleteEnvironmentDTO = { workspaceId: string; id: string };
