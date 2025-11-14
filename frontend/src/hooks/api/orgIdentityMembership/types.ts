import { TRoles } from "@app/hooks/api/shared";

export type TOrgIdentityMembership = {
  id: string;
  orgId: string;
  identityId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateOrgIdentityMembershipDTO = {
  identityId: string;
  roles: TRoles;
};

export type TDeleteOrgIdentityMembershipDTO = {
  identityId: string;
};

export type TListOrgIdentityMembershipsDTO = {
  offset?: number;
  limit?: number;
  identityName?: string;
  roles?: string[];
};

export type TListAvailableOrganizationIdentitiesDTO = {
  offset?: number;
  limit?: number;
  identityName?: string;
};

export type TAvailableOrganizationIdentities = Array<{ id: string; name: string }>;
