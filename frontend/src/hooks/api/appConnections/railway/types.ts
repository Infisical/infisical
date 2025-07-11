export type TRailwayProject = {
  id: string;
  name: string;
  environments: Array<{
    id: string;
    name: string;
  }>;
  services: Array<{
    id: string;
    name: string;
  }>;
};
