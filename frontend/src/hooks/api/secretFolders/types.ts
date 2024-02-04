export type TSecretFolder = {
  id: string;
  name: string;
};

export type TGetProjectFoldersDTO = {
  projectId: string;
  environment: string;
  path?: string;
};

export type TGetFoldersByEnvDTO = {
  environments: string[];
  projectId: string;
  path?: string;
};

export type TCreateFolderDTO = {
  projectId: string;
  environment: string;
  name: string;
  path?: string;
};

export type TUpdateFolderDTO = {
  projectId: string;
  environment: string;
  name: string;
  folderId: string;
  path?: string;
};

export type TDeleteFolderDTO = {
  projectId: string;
  environment: string;
  folderId: string;
  path?: string;
};
