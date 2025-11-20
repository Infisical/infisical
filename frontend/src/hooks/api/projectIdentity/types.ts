import { TIdentity, TMetadata } from "@app/hooks/api/shared";

export type TProjectIdentityMetadata = {
  key: string;
  value: string;
  id: string;
};

export type TProjectIdentity = TIdentity;

export type TCreateProjectIdentityDTO = {
  projectId: string;
  name: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata[];
};

export type TUpdateProjectIdentityDTO = {
  projectId: string;
  identityId: string;
  name?: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata[];
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
