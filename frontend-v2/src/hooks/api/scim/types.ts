export type ScimTokenData = {
  id: string;
  ttlDays: number;
  description: string;
  tokenSuffix: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateScimTokenDTO = {
  organizationId: string;
  description?: string;
  ttlDays?: number;
};

export type DeleteScimTokenDTO = {
  organizationId: string;
  scimTokenId: string;
};

export type CreateScimTokenRes = {
  scimToken: string;
};
