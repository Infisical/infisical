import { OrgServiceActor } from "@app/lib/types";

// TODO(namespace): add validation for all search params
export enum NamespaceUserMembershipTemporaryMode {
  Relative = "relative"
}

export type TCreateNamespaceUserMembershipDTO = {
  permission: OrgServiceActor;
  namespaceSlug: string;
  validatedUsers: { id: string; username: string }[];
  roleSlugs: string[];
};

export type TUpdateNamespaceUserMembershipDTO = {
  permission: OrgServiceActor;
  namespaceSlug: string;
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
  namespaceSlug: string;
  permission: OrgServiceActor;
};

export type TListNamespaceMembershipDTO = {
  namespaceSlug: string;
  permission: OrgServiceActor;
  limit?: number;
  offset?: number;
};

export type TGetNamespaceMembershipByIdDTO = {
  membershipId: string;
  namespaceSlug: string;
  permission: OrgServiceActor;
};

export type TSearchNamespaceMembershipDTO = {
  namespaceSlug: string;
  permission: OrgServiceActor;
  username?: string;
  limit?: number;
  offset?: number;
};
