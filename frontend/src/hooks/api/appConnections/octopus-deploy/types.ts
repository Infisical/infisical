export type TOctopusDeploySpace = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

export type TOctopusDeployProject = {
  id: string;
  name: string;
  slug: string;
};

export type TOctopusDeployScopeValues = {
  environments: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  machines: { id: string; name: string }[];
  processes: { id: string; name: string }[];
  actions: { id: string; name: string }[];
  channels: { id: string; name: string }[];
};

export type TScopeValueOption = {
  id: string;
  name: string;
};
