export type TPortainerEnvironment = {
  id: number;
  name: string;
};

export type TPortainerStack = {
  id: number;
  name: string;
  environmentId: number;
  isGitBased: boolean;
};
