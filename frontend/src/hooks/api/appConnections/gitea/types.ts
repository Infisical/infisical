export type TGiteaOrganization = {
  id: string;
  name: string;
  fullName: string;
};

export type TGiteaRepository = {
  id: string;
  name: string;
  owner: Pick<TGiteaOrganization, "name">;
};

export type TGiteaListOrganizationsResponse = {
  organizations: TGiteaOrganization[];
};

export type TGiteaListRepositoriesResponse = {
  repositories: TGiteaRepository[];
};
