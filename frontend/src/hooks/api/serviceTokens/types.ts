export type ServiceToken = {
  _id: string;
  name: string;
  workspace: string;
  environment: string;
  user: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type CreateServiceTokenDTO = {
  name: string;
  workspaceId: string;
  environment: string;
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
