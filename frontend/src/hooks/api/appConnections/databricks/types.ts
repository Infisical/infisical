export type TDatabricksSecretScope = {
  name: string;
};

export type TDatabricksConnectionListSecretScopesResponse = {
  secretScopes: TDatabricksSecretScope[];
};

export type TDatabricksServicePrincipal = {
  id: string;
  name: string;
  clientId: string;
};

export type TDatabricksConnectionListServicePrincipalsResponse = {
  servicePrincipals: TDatabricksServicePrincipal[];
};
