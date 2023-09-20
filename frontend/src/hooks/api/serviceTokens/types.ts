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

export type ServiceTokenDataV3 = {
  _id: string;
  name: string;
  workspace: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
};

// TODO: add scopes
// TODO: encrypted key info
export type CreateServiceTokenDataV3DTO = {
  name: string;
  workspaceId: string;
  publicKey: string;
}

export type CreateServiceTokenDataV3Res = {
  serviceToken: string;
  serviceTokenData: ServiceTokenDataV3;
}

export type UpdateServiceTokenDataV3DTO = {
  serviceTokenDataId: string;
  name?: string;
  isActive?: boolean;
}

export type DeleteServiceTokenDataV3DTO = {
  serviceTokenDataId: string;
}