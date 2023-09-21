export type ServiceTokenScope = {
  environment: string;
  secretPath: string;
};

export type ServiceToken = {
  _id: string;
  name: string;
  workspace: string;
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

// --- v3

export type ServiceTokenV3Scope = {
  permission: string;
  environment: string;
  secretPath: string;
};

export type ServiceTokenDataV3 = {
  _id: string;
  name: string;
  workspace: string;
  isActive: boolean;
  lastUsed?: string;
  scopes: ServiceTokenV3Scope[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateServiceTokenDataV3DTO = {
  name: string;
  workspaceId: string;
  publicKey: string;
  scopes: ServiceTokenV3Scope[];
  expiresIn?: number;
  encryptedKey: string;
  nonce: string;
}

export type CreateServiceTokenDataV3Res = {
  serviceToken: string;
  serviceTokenData: ServiceTokenDataV3;
}

export type UpdateServiceTokenDataV3DTO = {
  serviceTokenDataId: string;
  isActive?: boolean;
  name?: string;
  scopes?: ServiceTokenV3Scope[];
  expiresIn?: number;
}

export type DeleteServiceTokenDataV3DTO = {
  serviceTokenDataId: string;
}