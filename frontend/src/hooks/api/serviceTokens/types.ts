import { Permission } from "./enums";

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
  permissions: Permission[];
  environment: string;
  secretPath: string;
};

export type ServiceTokenV3TrustedIp = {
  _id: string;
  ipAddress: string;
  type: "ipv4" | "ipv6";
  prefix?: number;
}

export type ServiceTokenDataV3 = {
  _id: string;
  name: string;
  workspace: string;
  isActive: boolean;
  lastUsed?: string;
  usageCount: number;
  scopes: ServiceTokenV3Scope[];
  trustedIps: ServiceTokenV3TrustedIp[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateServiceTokenDataV3DTO = {
  name: string;
  workspaceId: string;
  publicKey: string;
  scopes: ServiceTokenV3Scope[];
  trustedIps: {
    ipAddress: string;
  }[];
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
  trustedIps?: {
    ipAddress: string;
  }[];
  expiresIn?: number;
}

export type DeleteServiceTokenDataV3DTO = {
  serviceTokenDataId: string;
}