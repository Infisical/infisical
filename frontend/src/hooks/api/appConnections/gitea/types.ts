export type TGiteaRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
};

export type TGiteaConnectionListRepositoriesResponse = TGiteaRepo[];
