export type TDatabricksSecretScope = {
  name: string;
};

export type TDatabricksConnectionListSecretScopesResponse = {
  secretScopes: TDatabricksSecretScope[];
};
