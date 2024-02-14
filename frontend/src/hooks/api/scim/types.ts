export type ScimTokenData = {
    id: string;
    ttl: number;
    description: string;
    tokenSuffix: string;
    orgId: string;
    createdAt: string;
    updatedAt: string;
};

export type CreateScimTokenDTO = {
    organizationId: string;
    description?: string;
    ttl?: number;
}

export type DeleteScimTokenDTO = {
    organizationId: string;
    scimTokenId: string;
}

export type CreateScimTokenRes = {
    scimToken: string;
}