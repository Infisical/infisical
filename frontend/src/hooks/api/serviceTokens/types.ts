export type ServiceTokenScope = {
  environment: string;
  secretPath: string;
};

export type ServiceToken = {
  id: string;
  name: string;
  projectId: string;
  scopes: ServiceTokenScope[];
  user: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type CreateServiceTokenDTO = {
  name: string;
  workspaceId: string;
  scopes: ServiceTokenScope[];
  expiresIn: number;
  encryptedKey: string;
  iv: string;
  tag: string;
  randomBytes: string;
  permissions: string[];
};

export type CreateServiceTokenRes = {
  serviceToken: string;
  serviceTokenData: ServiceToken;
};

export type DeleteServiceTokenRes = { serviceTokenData: ServiceToken };
