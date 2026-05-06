import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { RESOURCE_SCOPE, TableName, TMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

export type TMembershipDALFactory = ReturnType<typeof membershipDALFactory>;

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

  return { ...orm, findResourceMembershipsForActor };
};
