export type APIKeyDataV2 = {
    _id: string;
    name: string;
    user: string;
    lastUsed?: string;
    usageCount: number;
    createdAt: string;
    updatedAt: string;
  };

export type CreateAPIKeyDataV2DTO = {
    name: string;
}

export type CreateServiceTokenDataV3Res = {
    apiKeyData: APIKeyDataV2;
    apiKey: string;
}

export type UpdateAPIKeyDataV2DTO = {
    apiKeyDataId: string;
    name: string;
}

export type DeleteAPIKeyDataV2DTO = {
    apiKeyDataId: string;
}