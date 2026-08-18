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

  return { ...orm, findResourceMembershipsForActor, findResourceMembershipsForActors, findResourceMembershipsForGroup };
};
