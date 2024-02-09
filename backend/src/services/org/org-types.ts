import { TOrgPermission } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export type TUpdateOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  role: string;
  actorOrgId?: string;
};

export type TDeleteOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  actorOrgId?: string;
};

export type TInviteUserToOrgDTO = {
  userId: string;
  orgId: string;
  actorOrgId?: string;
  inviteeEmail: string;
};

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};

export type TFindAllWorkspacesDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId?: string;
  orgId: string;
};

export type TUpdateOrgDTO = {
  data: Partial<{ name: string; slug: string; authEnforced: boolean }>;
} & TOrgPermission;
