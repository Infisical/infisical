export type TSecretFolder = {
  id: string;
  name: string;
};

export type GetProjectFoldersDTO = {
  workspaceId: string;
  environment: string;
  parentFolderId?: string;
  isPaused?: boolean;
  sortDir?: 'asc' | 'desc';
};

export type CreateFolderDTO = {
  workspaceId: string;
  environment: string;
  folderName: string;
  parentFolderId?: string;
};

export type UpdateFolderDTO = {
  workspaceId: string;
  environment: string;
  name: string;
  folderId: string;
};

export type DeleteFolderDTO = {
  workspaceId: string;
  environment: string;
  folderId: string;
};
