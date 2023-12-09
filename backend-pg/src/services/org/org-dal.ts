import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TOrganizations,
  TOrgMemberships,
  TOrgMembershipsInsert,
  TOrgMembershipsUpdate
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { withTransaction } from "@app/lib/knex";

export type TOrgDalFactory = ReturnType<typeof orgDalFactory>;

export const orgDalFactory = (db: TDbClient) => {
  const findOrgById = async (orgId: string) => {
    try {
      const org = await db(TableName.Organization).where({ id: orgId }).first();
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org by id" });
    }
  };

  // special query
  const findAllOrgsByUserId = async (userId: string): Promise<TOrganizations[]> => {
    try {
      const org = await db(TableName.OrgMembership)
        .where({ userId })
        .join(
          TableName.Organization,
          `${TableName.OrgMembership}.orgId`,
          `${TableName.Organization}.id`
        )
        .select(`${TableName.Organization}.*`);
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org by user id" });
    }
  };

  // special query
  const findAllOrgMembers = async (orgId: string) => {
    try {
      const members = await db(TableName.OrgMembership)
        .where({ orgId })
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .join(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.OrgMembership),
          db.ref("inviteEmail").withSchema(TableName.OrgMembership),
          db.ref("orgId").withSchema(TableName.OrgMembership),
          db.ref("role").withSchema(TableName.OrgMembership),
          db.ref("roleId").withSchema(TableName.OrgMembership),
          db.ref("status").withSchema(TableName.OrgMembership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        );
      return members.map(({ email, firstName, lastName, userId, publicKey, ...data }) => ({
        ...data,
        user: { email, firstName, lastName, id: userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all org members" });
    }
  };

  const create = async ({ name }: { name: string }, tx?: Knex) => {
    try {
      const [organization] = await (tx || db)(TableName.Organization)
        .insert({ name })
        .returning("*");
      return organization;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create organization" });
    }
  };

  const deleteById = async (orgId: string, tx?: Knex) => {
    try {
      const [org] = await (tx || db)(TableName.Organization)
        .where({ id: orgId })
        .delete()
        .returning("*");
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update organization" });
    }
  };

  const updateById = async (orgId: string, data: Partial<TOrganizations>) => {
    try {
      const [org] = await db(TableName.Organization)
        .where({ id: orgId })
        .update({ ...data })
        .returning("*");
      return org;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update organization" });
    }
  };

  // MEMBERSHIP OPERATIONS
  // --------------------
  const findMembership = async (filter: Partial<TOrgMemberships>, tx?: Knex) => {
    try {
      const membership = await (tx || db)(TableName.OrgMembership).where(filter);
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org membership" });
    }
  };

  const createMembership = async (data: TOrgMembershipsInsert, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.OrgMembership).insert(data).returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create org membership" });
    }
  };

  const updateMembershipById = async (id: string, data: TOrgMembershipsUpdate, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.OrgMembership)
        .where({ id })
        .update(data)
        .returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update org membership" });
    }
  };

  const updateMembership = async (
    filter: Partial<TOrgMemberships>,
    data: TOrgMembershipsUpdate,
    tx?: Knex
  ) => {
    try {
      const membership = await (tx || db)(TableName.OrgMembership)
        .where(filter)
        .update(data)
        .returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update org memberships" });
    }
  };

  const deleteMembershipById = async (id: string, orgId: string, tx?: Knex) => {
    try {
      const [membership] = await (tx || db)(TableName.OrgMembership)
        .where({ id, orgId })
        .delete()
        .returning("*");
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete org membership" });
    }
  };

  return withTransaction(db, {
    findAllOrgMembers,
    findOrgById,
    findAllOrgsByUserId,
    create,
    updateById,
    deleteById,
    findMembership,
    createMembership,
    updateMembershipById,
    deleteMembershipById,
    updateMembership
  });
};
