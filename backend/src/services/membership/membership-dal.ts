import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, RESOURCE_SCOPE, TableName, TMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

export type TMembershipDALFactory = ReturnType<typeof membershipDALFactory>;

export type TResourceMembershipForActor = TMemberships & {
  forActorType: ActorType.USER | ActorType.IDENTITY;
  forActorId: string;
};

// Id order matches lockUserProjectMemberships, so a grant and a removal cannot deadlock on two
// membership rows. Returns only the rows still present: a missing row was already removed, or the
// member was added back under a new one, and deleting privileges for it would wipe that new grant.
export const lockMembershipsById = async (ids: string[], tx: Knex) => {
  if (!ids.length) return [];

  try {
    const memberships = await tx(TableName.Membership)
      .whereIn("id", ids)
      .orderBy("id")
      .select(selectAllTableCols(TableName.Membership))
      .forUpdate();
    return memberships as TMemberships[];
  } catch (error) {
    throw new DatabaseError({ error, name: "Lock memberships by id" });
  }
};

export const membershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);

  const findResourceMembershipsForActor = async (
    {
      projectId,
      resourceType,
      actorType,
      actorId
    }: {
      projectId: string;
      resourceType: string;
      actorType: ActorType;
      actorId: string;
    },
    tx?: Knex
  ): Promise<TMemberships[]> => {
    try {
      const conn = tx || db.replicaNode();

      const userGroupSubquery = conn(TableName.UserGroupMembership).where("userId", actorId).select("groupId");
      const identityGroupSubquery = conn(TableName.IdentityGroupMembership)
        .where("identityId", actorId)
        .select("groupId");

      return (await conn(TableName.Membership)
        .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.scopeResourceType`, resourceType)
        .where((qb) => {
          if (actorType === ActorType.USER) {
            void qb
              .where(`${TableName.Membership}.actorUserId`, actorId)
              .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
          } else {
            void qb
              .where(`${TableName.Membership}.actorIdentityId`, actorId)
              .orWhereIn(`${TableName.Membership}.actorGroupId`, identityGroupSubquery);
          }
        })
        .select(`${TableName.Membership}.*`)) as TMemberships[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for actor" });
    }
  };

  // Batched form of findResourceMembershipsForActor: a fixed number of queries for any number of actors,
  // for callers that would otherwise loop. A group's row comes back once per actor inheriting through it,
  // tagged with that actor, so the caller buckets rows without resolving group membership itself.
  const findResourceMembershipsForActors = async (
    {
      projectId,
      resourceTypes,
      userIds,
      identityIds
    }: {
      projectId: string;
      resourceTypes: string[];
      userIds: string[];
      identityIds: string[];
    },
    tx?: Knex
  ): Promise<TResourceMembershipForActor[]> => {
    if (!resourceTypes.length || (!userIds.length && !identityIds.length)) return [];

    try {
      const conn = tx || db.replicaNode();
      const scoped = () =>
        conn(TableName.Membership)
          .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .whereIn(`${TableName.Membership}.scopeResourceType`, resourceTypes);

      const rows: TResourceMembershipForActor[] = [];

      if (userIds.length) {
        const direct = (await scoped()
          .whereIn(`${TableName.Membership}.actorUserId`, userIds)
          .select(selectAllTableCols(TableName.Membership))) as TMemberships[];
        rows.push(
          ...direct.map((row) => ({ ...row, forActorType: ActorType.USER as const, forActorId: row.actorUserId! }))
        );

        const viaGroups = (await scoped()
          .join(
            TableName.UserGroupMembership,
            `${TableName.UserGroupMembership}.groupId`,
            `${TableName.Membership}.actorGroupId`
          )
          .whereIn(`${TableName.UserGroupMembership}.userId`, userIds)
          .select(selectAllTableCols(TableName.Membership))
          .select(db.ref("userId").withSchema(TableName.UserGroupMembership).as("forActorId"))) as (TMemberships & {
          forActorId: string;
        })[];
        rows.push(...viaGroups.map((row) => ({ ...row, forActorType: ActorType.USER as const })));
      }

      if (identityIds.length) {
        const direct = (await scoped()
          .whereIn(`${TableName.Membership}.actorIdentityId`, identityIds)
          .select(selectAllTableCols(TableName.Membership))) as TMemberships[];
        rows.push(
          ...direct.map((row) => ({
            ...row,
            forActorType: ActorType.IDENTITY as const,
            forActorId: row.actorIdentityId!
          }))
        );

        const viaGroups = (await scoped()
          .join(
            TableName.IdentityGroupMembership,
            `${TableName.IdentityGroupMembership}.groupId`,
            `${TableName.Membership}.actorGroupId`
          )
          .whereIn(`${TableName.IdentityGroupMembership}.identityId`, identityIds)
          .select(selectAllTableCols(TableName.Membership))
          .select(
            db.ref("identityId").withSchema(TableName.IdentityGroupMembership).as("forActorId")
          )) as (TMemberships & { forActorId: string })[];
        rows.push(...viaGroups.map((row) => ({ ...row, forActorType: ActorType.IDENTITY as const })));
      }

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for actors" });
    }
  };

  const findResourceMembershipsForGroup = async (
    { projectId, resourceType, groupId }: { projectId: string; resourceType: string; groupId: string },
    tx?: Knex
  ): Promise<TMemberships[]> => {
    try {
      const conn = tx || db.replicaNode();
      return (await conn(TableName.Membership)
        .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.scopeResourceType`, resourceType)
        .where(`${TableName.Membership}.actorGroupId`, groupId)
        .select(`${TableName.Membership}.*`)) as TMemberships[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resource memberships for group" });
    }
  };

  // Matches a user's project memberships the way permissionDAL.getPermission does, directly or through a
  // group, so it answers whether a privilege granted to the user in the project would take effect.
  const isUserProjectMember = async ({ projectId, userId }: { projectId: string; userId: string }, tx?: Knex) => {
    try {
      const conn = tx || db.replicaNode();
      const userGroupSubquery = conn(TableName.UserGroupMembership).where("userId", userId).select("groupId");

      const membership = (await conn(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where((qb) => {
          void qb
            .where(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
        })
        .first(`${TableName.Membership}.id`)) as { id: string } | undefined;
      return Boolean(membership);
    } catch (error) {
      throw new DatabaseError({ error, name: "Is user project member" });
    }
  };

  // Same rows removal locks, held across the privilege insert. A privilege written after that
  // delete survives and takes effect if the user is added back. Locks every matching membership
  // in id order, direct or through a group. The group subquery is not locked; removal locks the
  // group's project membership instead.
  const lockUserProjectMemberships = async ({ projectId, userId }: { projectId: string; userId: string }, tx: Knex) => {
    try {
      const userGroupSubquery = tx(TableName.UserGroupMembership).where("userId", userId).select("groupId");

      const lockedMemberships = (await tx(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where((qb) => {
          void qb
            .where(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
        })
        .orderBy(`${TableName.Membership}.id`)
        .select(`${TableName.Membership}.id`)
        .forUpdate()) as { id: string }[];
      if (!lockedMemberships.length) return false;

      const membership = (await tx(TableName.Membership)
        .whereIn(
          `${TableName.Membership}.id`,
          lockedMemberships.map(({ id }) => id)
        )
        .where((qb) => {
          void qb
            .where(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
        })
        .first(`${TableName.Membership}.id`)) as { id: string } | undefined;
      return Boolean(membership);
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock user project memberships" });
    }
  };

  // Locks the row so a concurrent deactivation or removal of the same membership serializes behind the
  // caller. Always reads the primary, so it also bypasses the cached permission blob.
  const lockOrgMembershipForUser = async (
    orgId: string,
    userId: string,
    tx: Knex
  ): Promise<TMemberships | undefined> => {
    try {
      return await tx(TableName.Membership)
        .where({ scope: AccessScope.Organization, scopeOrgId: orgId, actorUserId: userId })
        .select(selectAllTableCols(TableName.Membership))
        .forUpdate()
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "LockOrgMembershipForUser" });
    }
  };

  // Same as lockOrgMembershipForUser, for an actor's direct membership on one resource.
  const lockResourceMembershipForActor = async (
    {
      projectId,
      resourceType,
      resourceId,
      actorType,
      actorId
    }: {
      projectId: string;
      resourceType: string;
      resourceId: string;
      actorType: ActorType;
      actorId: string;
    },
    tx: Knex
  ): Promise<TMemberships | undefined> => {
    try {
      return await tx(TableName.Membership)
        .where({
          scope: RESOURCE_SCOPE,
          scopeProjectId: projectId,
          scopeResourceType: resourceType,
          scopeResourceId: resourceId,
          ...(actorType === ActorType.USER ? { actorUserId: actorId } : { actorIdentityId: actorId })
        })
        .select(selectAllTableCols(TableName.Membership))
        .forUpdate()
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "LockResourceMembershipForActor" });
    }
  };

  // For deletes that must take the membership row lock before touching its roles, the same order
  // lockResourceMembershipForActor callers use, so the two can't deadlock.
  const lockById = async (id: string, tx: Knex): Promise<TMemberships | undefined> => {
    try {
      return await tx(TableName.Membership)
        .where({ id })
        .select(selectAllTableCols(TableName.Membership))
        .forUpdate()
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "LockMembershipById" });
    }
  };

  return {
    ...orm,
    lockById,
    findResourceMembershipsForActor,
    findResourceMembershipsForActors,
    findResourceMembershipsForGroup,
    isUserProjectMember,
    lockUserProjectMemberships,
    lockOrgMembershipForUser,
    lockResourceMembershipForActor
  };
};
