export type TProjectIdentityMetadata = {
  key: string;
  value: string;
  id: string;
};

export type TProjectIdentity = {
  id: string;
  name: string;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  hasDeleteProtection: boolean;
  metadata?: TProjectIdentityMetadata[];
};

export type TCreateProjectIdentityDTO = {
  projectId: string;
  name: string;
  hasDeleteProtection?: boolean;
  metadata?: Array<{
    key: string;
    value: string;
  }>;
};

export type TUpdateProjectIdentityDTO = {
  projectId: string;
  identityId: string;
  name?: string;
  hasDeleteProtection?: boolean;
  metadata?: Array<{
    key: string;
    value: string;
  }>;
};

export type TGetProjectIdentityByIdDTO = {
  projectId: string;
  identityId: string;
};

export type TListProjectIdentitiesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TDeleteProjectIdentityDTO = {
  projectId: string;
  identityId: string;
};
