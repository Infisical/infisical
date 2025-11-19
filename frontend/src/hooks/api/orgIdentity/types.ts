import { TIdentity, TMetadata } from "@app/hooks/api/shared";

export type TOrgIdentity = TIdentity;

export type TCreateOrgIdentityDTO = {
  name: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata;
};

export type TUpdateOrgIdentityDTO = {
  identityId: string;
  name?: string;
  hasDeleteProtection?: boolean;
  metadata?: TMetadata;
};

export type TGetOrgIdentityByIdDTO = {
  identityId: string;
};

export type TListOrgIdentitiesDTO = {
  offset?: number;
  limit?: number;
  search?: string;
};

export type TDeleteOrgIdentityDTO = {
  identityId: string;
  orgId: string;
};
