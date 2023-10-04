export type TSecretFolder = {
  id: string;
  name: string;
};

export type TGetProjectFoldersDTO = {
  workspaceId: string;
  environment: string;
  directory?: string;
};

export type TGetFoldersByEnvDTO = {
  environments: string[];
  workspaceId: string;
  directory?: string;
};

export type TCreateFolderDTO = {
  workspaceId: string;
  environment: string;
  folderName: string;
  directory?: string;
};

export type TUpdateFolderDTO = {
  workspaceId: string;
  environment: string;
  name: string;
  folderName: string;
  directory?: string;
};

export type TDeleteFolderDTO = {
  workspaceId: string;
  environment: string;
  folderName: string;
  directory?: string;
};
