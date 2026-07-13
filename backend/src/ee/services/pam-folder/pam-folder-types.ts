export type TCreatePamFolderDTO = {
  projectId: string;
  name: string;
  description?: string;
};

export type TUpdatePamFolderDTO = {
  folderId: string;
  projectId: string;
  name?: string;
  description?: string | null;
};

export type TDeletePamFolderDTO = {
  folderId: string;
  projectId: string;
};

export type TGetPamFolderDTO = {
  folderId: string;
  projectId: string;
};

export type TListPamFoldersDTO = {
  projectId: string;
  search?: string;
  onlyAccessible?: boolean;
};
