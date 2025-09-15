import { Knex } from "knex";

import { TIdentityGroups } from "@app/db/schemas";
import { TGenericPermission } from "@app/lib/types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TIdentityGroupMembershipDALFactory } from "./identity-group-membership-dal";
import { TIdentityGroupProjectDALFactory } from "./identity-group-project-membership-dal";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";

export type TCreateIdentityGroupDTO = {
  name: string;
  slug?: string;
  role: string;
} & TGenericPermission;

export type TUpdateIdentityGroupDTO = {
  id: string;
} & Partial<{
  name: string;
  slug: string;
  role: string;
}> &
  TGenericPermission;

export type TDeleteIdentityGroupDTO = {
  id: string;
} & TGenericPermission;

export type TGetIdentityGroupByIdDTO = {
  id: string;
} & TGenericPermission;

export type TListIdentityGroupIdentitiesDTO = {
  id: string;
  offset: number;
  limit: number;
  search?: string;
  filter?: EFilterReturnedIdentities;
} & TGenericPermission;

export type TListProjectIdentityGroupIdentitiesDTO = TListIdentityGroupIdentitiesDTO & {
  projectId: string;
};

export type TAddIdentityToGroupDTO = {
  id: string;
  identityId: string;
} & TGenericPermission;

export type TRemoveIdentityFromGroupDTO = {
  id: string;
  identityId: string;
} & TGenericPermission;

// identity group fns types

export type TAddIdentitiesToGroup = {
  identityIds: string[];
  group: TIdentityGroups;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  identityGroupProjectDAL: Pick<TIdentityGroupProjectDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  tx: Knex;
};

export type TAddIdentitiesToGroupByIdentityIds = {
  group: TIdentityGroups;
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "find" | "transaction">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "transaction" | "insertMany">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "find">;
  identityGroupProjectDAL: Pick<TIdentityGroupProjectDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  tx?: Knex;
};

export type TRemoveIdentitiesFromGroupByIdentityIds = {
  group: TIdentityGroups;
  identityIds: string[];
  identityDAL: Pick<TIdentityDALFactory, "find" | "transaction">;
  identityGroupMembershipDAL: Pick<
    TIdentityGroupMembershipDALFactory,
    "find" | "filterProjectsByIdentityMembership" | "delete"
  >;
  tx?: Knex;
};

export enum EFilterReturnedIdentities {
  EXISTING_MEMBERS = "existingMembers",
  NON_MEMBERS = "nonMembers"
}
