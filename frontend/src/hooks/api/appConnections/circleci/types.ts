export type TCircleCIProject = {
  name: string;
  id: string;
};

export type TCircleCIOrganization = {
  name: string;
  projects: TCircleCIProject[];
};

export type TCircleCIOrganizationListResponse = {
  organizations: TCircleCIOrganization[];
};
