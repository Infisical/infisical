export type TRemoteInfisicalProject = {
  id: string;
  name: string;
  slug: string;
  type: string;
  environments: Array<{ id: string; name: string; slug: string }>;
};

export type TRemoteInfisicalFolder = {
  id: string;
  name: string;
  path: string;
};

export type TRemoteInfisicalEnvironmentFolderTree = Record<
  string,
  { id: string; name: string; slug: string; folders: TRemoteInfisicalFolder[] }
>;
