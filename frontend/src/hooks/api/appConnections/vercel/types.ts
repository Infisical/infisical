export type TVercelApp = {
  id: string;
  name: string;
  envs: { id: string; name: string }[];
};

export type TVercelConnectionEnvironment = {
  id: string;
  slug: string;
  type: string;
  target?: string[];
  gitBranch?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type TVercelConnectionApp = {
  id: string;
  name: string;
};

export type TVercelConnectionProject = TVercelConnectionApp & {
  envs: TVercelConnectionEnvironment[];
  previewBranches: string[];
};

export type TVercelConnectionOrganization = {
  id: string;
  name: string;
  slug: string;
  apps: TVercelConnectionApp[];
};
