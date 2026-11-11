import { Knex } from "knex";

import { RESOURCE_SCOPE, TableName, TMembershipRolesInsert, TMembershipsInsert } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { ActorType } from "@app/lib/auth/actor-types";
import { DatabaseError } from "@app/lib/errors";

import { Membership, TMembershipProps } from "../model/membership";
import { TRoleAssignmentProps } from "../model/role-assignment";

export type TNewMembership = Omit<TMembershipsInsert, "id" | "createdAt" | "updatedAt"> & {
  roles: Omit<TMembershipRolesInsert, "id" | "membershipId" | "createdAt" | "updatedAt">[];
};

export type TMembershipDataAccess = {
  findById(id: string, options?: TReadOptions): Promise<Membership | undefined>;
  findByIds(ids: string[], options?: TReadOptions): Promise<Membership[]>;
  create(membership: TNewMembership): Promise<Membership>;
  // The actor's memberships on resources of one type in a project, directly or through its groups, active or not.
  findResourceMembershipsForActor(
    input: {
      actor: { type: ActorType.USER | ActorType.IDENTITY; id: string };
      projectId: string;
      resourceType: string;
    },
    options?: TReadOptions
  ): Promise<Membership[]>;
  // Deletes the memberships and their role assignments (cascade), returning what was deleted.
  deleteByIds(ids: string[]): Promise<Membership[]>;
};

// Owns memberships and membership_roles. Role assignments are read with their membership.
export class MembershipDataAccess implements TMembershipDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findById(id: string, options?: TReadOptions): Promise<Membership | undefined> {
    const [membership] = await this.findByIds([id], options);
    return membership;
  }

  async findByIds(ids: string[], options?: TReadOptions): Promise<Membership[]> {
    if (!ids.length) return [];
    try {
      const knex = this.db.reader(options);
      const memberships = await knex(TableName.Membership).whereIn("id", ids).select("*");
      const roles = (await knex(TableName.MembershipRole)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .whereIn(`${TableName.MembershipRole}.membershipId`, ids)
        .select(knex.ref("*").withSchema(TableName.MembershipRole))
        .select(
          knex.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          knex.ref("name").withSchema(TableName.Role).as("customRoleName"),
          knex.ref("permissions").withSchema(TableName.Role).as("customRolePermissions")
        )
        .orderBy(`${TableName.MembershipRole}.id`)) as unknown as (TRoleAssignmentProps & { membershipId: string })[];
      return memberships.map((membership) =>
        Membership.restore({
          ...membership,
          roles: roles.filter((role) => role.membershipId === membership.id)
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find memberships" });
    }
  }

  async findResourceMembershipsForActor(
    {
      actor,
      projectId,
      resourceType
    }: { actor: { type: ActorType.USER | ActorType.IDENTITY; id: string }; projectId: string; resourceType: string },
    options?: TReadOptions
  ): Promise<Membership[]> {
    try {
      const knex = this.db.reader(options);
      const groupIds =
        actor.type === ActorType.USER
          ? knex(TableName.UserGroupMembership).where("userId", actor.id).select("groupId")
          : knex(TableName.IdentityGroupMembership).where("identityId", actor.id).select("groupId");
      const directColumn = actor.type === ActorType.USER ? "actorUserId" : "actorIdentityId";
      const rows = await knex(TableName.Membership)
        .where({ scope: RESOURCE_SCOPE, scopeProjectId: projectId, scopeResourceType: resourceType })
        .where((qb) => {
          void qb.where(directColumn, actor.id).orWhereIn("actorGroupId", groupIds as Knex.QueryBuilder);
        })
        .select("id");
      return await this.findByIds(
        rows.map((row) => row.id),
        options
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for actor" });
    }
  }

  async create({ roles, ...membership }: TNewMembership): Promise<Membership> {
    try {
      const knex = this.db.writer();
      const [row] = await knex(TableName.Membership).insert(membership).returning("*");
      const roleRows = roles.length
        ? await knex(TableName.MembershipRole)
            .insert(roles.map((role) => ({ ...role, membershipId: row.id })))
            .returning("*")
        : [];
      return Membership.restore({ ...row, roles: roleRows } as TMembershipProps);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create membership" });
    }
  }

  async deleteByIds(ids: string[]): Promise<Membership[]> {
    if (!ids.length) return [];
    try {
      const knex = this.db.writer();
      const rows = await knex(TableName.Membership).whereIn("id", ids).del().returning("*");
      return rows.map((row) => Membership.restore({ ...row, roles: [] }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete memberships" });
    }
  }
}
