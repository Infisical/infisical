import { TRoles } from "@app/hooks/api/shared";

export type TOrgGroupMembership = {
  id: string;
  orgId: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateOrgGroupMembershipDTO = {
  groupId: string;
  roles: TRoles;
  organizationId?: string;
};

export type TDeleteOrgGroupMembershipDTO = {
  groupId: string;
};

export type TListAvailableOrganizationGroupsDTO = {
  offset?: number;
  limit?: number;
};

export type TAvailableOrganizationGroups = Array<{ id: string; name: string; slug: string }>;
