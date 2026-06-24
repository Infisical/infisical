export type TProjectGrant = {
  id: string;
  sourceProjectId: string;
  sourceFolderId: string;
  targetProjectId: string;
  createdAt: string;
  updatedAt: string;
  folderName: string;
  environmentName: string;
  environmentSlug: string;
  targetProjectName: string;
  secretCount: number;
};

export type TCreateProjectGrantDTO = {
  sourceProjectId: string;
  environment: string;
  secretPath: string;
  targetProjectId: string;
};

export type TDeleteProjectGrantDTO = {
  grantId: string;
  sourceProjectId: string;
};
