export type TCircleCIProject = {
  id: string;
  name: string;
  slug: string;
};

export type TCircleCIProjectListResponse = {
  projects: TCircleCIProject[];
};
