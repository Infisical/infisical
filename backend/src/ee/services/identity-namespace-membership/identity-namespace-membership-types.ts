import { OrderByDirection, TNamespacePermission } from "@app/lib/types";
import { NamespaceUserMembershipTemporaryMode } from "../namespace-user-membership/namespace-user-membership-types";

// TODO(namespace): add audit log for various events
export type TCreateIdentityNamespaceMembershipDTO = {
  identityId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
  permission: TNamespacePermission;
};

export type TUpdateIdentityNameespaceMembershipDTO = {
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
  identityId: string;
  permission: TNamespacePermission;
};

export type TDeleteIdentityNameespaceMembershipDTO = {
  identityId: string;
  permission: TNamespacePermission;
};

export type TListIdentityNameespaceMembershipDTO = {
  limit?: number;
  offset?: number;
  orderBy?: IdentityNameespaceMembershipOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  permission: TNamespacePermission;
};

export type TGetIdentityNameespaceMembershipByIdentityIdDTO = {
  identityId: string;
  permission: TNamespacePermission;
};

export type TGetIdentityNameespaceMembershipByMembershipIdDTO = {
  identityMembershipId: string;
  permission: TNamespacePermission;
};

export enum IdentityNameespaceMembershipOrderBy {
  Name = "name"
}
