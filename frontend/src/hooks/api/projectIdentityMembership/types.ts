import { TRoles } from "@app/hooks/api/shared";

export type TProjectIdentityMembership = {
  id: string;
  projectId: string;
  identityId: string;
  createdAt: string;
  updatedAt: string;
  // TODO
};

export type TCreateProjectIdentityMembershipDTO = {
  identityId: string;
  projectId: string;
  role?: string;
};

export type TUpdateProjectIdentityMembershipDTO = {
  identityId: string;
  projectId: string;
  roles: TRoles;
};

export type TDeleteProjectIdentityMembershipDTO = {
  identityId: string;
  projectId: string;
};

export type TListAvailableProjectIdentitiesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  identityName?: string;
};

export type TAvailableProjectIdentities = Array<{ id: string; name: string }>;
