export type TMetadata = {
  key: string;
  value: string;
};

export type TOrganizationIdentity = {
  id: string;
  name: string;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  hasDeleteProtection: boolean;
  authMethods?: string[];
  metadata?: TMetadata[];
};

export type TCreateOrganizationIdentityDTO = {
  name: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata[];
};

export type TUpdateOrganizationIdentityDTO = {
  identityId: string;
  name?: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata[];
};

export type TGetOrganizationIdentityByIdDTO = {
  identityId: string;
};

export type TListOrganizationIdentitiesDTO = {
  offset?: number;
  limit?: number;
  search?: string;
};

export type TDeleteOrganizationIdentityDTO = {
  identityId: string;
};
