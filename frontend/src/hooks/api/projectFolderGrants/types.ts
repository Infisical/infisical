export type TProjectFolderGrant = {
  id: string;
  sourceProjectId: string;
  sourceFolderId: string;
  targetProjectId: string;
  createdAt: string;
  updatedAt: string;
  folderName: string;
  secretPath: string;
  environmentName: string;
  environmentSlug: string;
  targetProjectName: string;
  secretCount: number;
};

export type TProjectFolderGrantReceived = {
  id: string;
  sourceProjectId: string;
  sourceFolderId: string;
  targetProjectId: string;
  createdAt: string;
  updatedAt: string;
  folderName: string;
  secretPath: string;
  environmentName: string;
  environmentSlug: string;
  sourceProjectName: string;
  sourceProjectSlug: string;
  secretCount: number;
};

export type TCreateProjectFolderGrantDTO = {
  sourceProjectId: string;
  environment: string;
  secretPath: string;
  targetProjectId: string;
};

export type TDeleteProjectFolderGrantDTO = {
  grantId: string;
  sourceProjectId: string;
};

export type TProjectFolderGrantUsage = {
  importCount: number;
  referenceCount: number;
};
