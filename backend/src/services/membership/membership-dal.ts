import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { RESOURCE_SCOPE, TableName, TMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

export type TMembershipDALFactory = ReturnType<typeof membershipDALFactory>;

export type TResourceMembershipForActor = TMemberships & {
  forActorType: ActorType.USER | ActorType.IDENTITY;
  forActorId: string;
};

export const membershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);

  const findResourceMembershipsForActor = async (
    {
      projectId,
      resourceType,
      resourceId,
      actorType,
      actorId
    }: {
      projectId: string;
      resourceType: string;
      // Narrows to a single resource. Without it this returns every resource of the type in the project,
      // which is what a caller wants when building an ability but never what a "may this actor use THIS
      // resource" check wants. Covered by membership_project_resource_idx.
      resourceId?: string;
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
          if (resourceId) {
            void qb.where(`${TableName.Membership}.scopeResourceId`, resourceId);
          }
        })
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

  // Org-wide rather than per-project: the caller is asking "does this actor broker anywhere at all", which
  // is what gates handing them a signing certificate. Group expansion covers users and identities, so a
  // grant held only through a group still counts.
  const countResourceMembershipsForActor = async (
    { resourceType, actorType, actorId }: { resourceType: string; actorType: ActorType; actorId: string },
    tx?: Knex
  ): Promise<number> => {
    try {
      const conn = tx || db.replicaNode();

      const userGroupSubquery = conn(TableName.UserGroupMembership).where("userId", actorId).select("groupId");
      const identityGroupSubquery = conn(TableName.IdentityGroupMembership)
        .where("identityId", actorId)
        .select("groupId");

      const [result] = await conn(TableName.Membership)
        .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
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
        .count<{ count: string | number }[]>(`${TableName.Membership}.id`);

      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count resource memberships for actor" });
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

  // Counts access-list members per resource in one query, so a list page showing "N with access" does not
  // fan out into a query per row. Counts membership rows, so a group counts once rather than by its size.
  const countResourceMembershipsByResourceIds = async (
    { resourceType, resourceIds }: { resourceType: string; resourceIds: string[] },
    tx?: Knex
  ): Promise<Record<string, number>> => {
    if (!resourceIds.length) return {};

    try {
      const rows = (await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, RESOURCE_SCOPE)
        .where(`${TableName.Membership}.scopeResourceType`, resourceType)
        .whereIn(`${TableName.Membership}.scopeResourceId`, resourceIds)
        .groupBy(`${TableName.Membership}.scopeResourceId`)
        .select(`${TableName.Membership}.scopeResourceId`)
        .count<{ scopeResourceId: string; count: string | number }[]>(`${TableName.Membership}.id`)) as unknown as {
        scopeResourceId: string;
        count: string | number;
      }[];

      return rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.scopeResourceId] = Number(row.count);
        return acc;
      }, {});
    } catch (error) {
      throw new DatabaseError({ error, name: "Count resource memberships by resource ids" });
    }
  };

  return {
    ...orm,
    findResourceMembershipsForActor,
    countResourceMembershipsForActor,
    findResourceMembershipsForActors,
    countResourceMembershipsByResourceIds,
    findResourceMembershipsForGroup
  };
};
