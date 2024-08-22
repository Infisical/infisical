import { TOrgPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TUpdateOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  role?: string;
  isActive?: boolean;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
};

export type TGetOrgMembershipDTO = {
  membershipId: string;
} & TOrgPermission;

export type TDeleteOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
};

export type TInviteUserToOrgDTO = {
  userId: string;
  orgId: string;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
  inviteeEmail: string;
};

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};

export type TFindOrgMembersByEmailDTO = {
  actor: ActorType;
  actorOrgId: string | undefined;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
  emails: string[];
};

export type TFindAllWorkspacesDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string | undefined;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
};

export type TUpdateOrgDTO = {
  data: Partial<{ name: string; slug: string; authEnforced: boolean; scimEnabled: boolean }>;
} & TOrgPermission;

export type TGetOrgGroupsDTO = TOrgPermission;

export type TListProjectMembershipsByOrgMembershipIdDTO = {
  orgMembershipId: string;
} & TOrgPermission;
