import { TemporaryPermissionMode } from "@app/db/schemas";

export type TOrgIdentityMembership = {
  id: string;
  orgId: string;
  identityId: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateOrgIdentityMembershipDTO = {
  identityId: string;
  roles: Array<
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: TemporaryPermissionMode;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  >;
};

export type TDeleteOrgIdentityMembershipDTO = {
  identityId: string;
};
