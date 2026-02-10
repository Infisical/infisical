export type TCoolifyApplication = {
  uuid: string;
  name: string;
  projectName: string;
  environmentName: string;
  created_at: string;
  updated_at: string;
};

export type TCoolifyProject = {
  uuid: string;
  name: string;
  description: string;
};

export type TCoolifyProjectEnvironment = {
  id: number;
  uuid: string;
  name: string;
  description: string;
};
