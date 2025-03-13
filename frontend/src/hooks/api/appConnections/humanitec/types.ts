export type THumanitecOrganization = {
  name: string;
  id: string;
  apps: THumanitecApp[];
};

export type THumanitecApp = {
  id: string;
  name: string;
  envs: { id: string; name: string }[];
};

export type THumanitecConnectionApp = {
  id: string;
  name: string;
  envs: THumanitecConnectionEnvironment[];
};

export type THumanitecConnectionEnvironment = {
  id: string;
  name: string;
};

export type THumanitecConnectionOrganization = {
  id: string;
  name: string;
  apps: THumanitecConnectionApp[];
};
