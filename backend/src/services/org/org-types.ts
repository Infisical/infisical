export type TUpdateOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  role: string;
};

export type TDeleteOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
};

export type TInviteUserToOrgDTO = {
  userId: string;
  orgId: string;
  inviteeEmail: string;
};

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};
