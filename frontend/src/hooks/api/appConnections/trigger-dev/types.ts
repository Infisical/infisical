export type TTriggerDevOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type TTriggerDevProject = {
  id: string;
  name: string;
  organization: TTriggerDevOrganization;
};
