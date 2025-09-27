// DTOs
export interface TCreateFolderDTO {
  projectId: string;
  parentId?: string | null;
  name: string;
  description?: string | null;
}

export interface TUpdateFolderDTO {
  id: string;
  name?: string;
  description?: string | null;
}
