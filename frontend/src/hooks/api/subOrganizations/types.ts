export type TSubOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  parentOrgId: string;
};

export type TCreateSubOrganizationDTO = {
  name: string;
  slug?: string;
};

export type TListSubOrganizationsDTO = {
  limit?: number;
  offset?: number;
  isAccessible?: boolean;
};

export type TUpdateSubOrganizationDTO = {
  subOrgId: string;
  name?: string;
  slug?: string;
};
