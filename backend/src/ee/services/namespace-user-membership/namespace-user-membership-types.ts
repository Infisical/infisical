import { OrgServiceActor } from "@app/lib/types";

// TODO(namespace): add validation for all search params
export enum NamespaceUserMembershipTemporaryMode {
  Relative = "relative"
}

export type TCreateNamespaceUserMembershipDTO = {
  permission: OrgServiceActor;
  namespaceName: string;
  validatedUsers: { id: string; username: string }[];
  roleSlugs: string[];
};

export type TUpdateNamespaceUserMembershipDTO = {
  permission: OrgServiceActor;
  namespaceName: string;
  membershipId: string;
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
};

export type TDeleteNamespaceMembershipDTO = {
  membershipId: string;
  namespaceName: string;
  permission: OrgServiceActor;
};

export type TListNamespaceMembershipDTO = {
  namespaceName: string;
  permission: OrgServiceActor;
  limit?: number;
  offset?: number;
};

export type TGetNamespaceMembershipByIdDTO = {
  membershipId: string;
  namespaceName: string;
  permission: OrgServiceActor;
};

export type TSearchNamespaceMembershipDTO = {
  namespaceName: string;
  permission: OrgServiceActor;
  username?: string;
  limit?: number;
  offset?: number;
};
