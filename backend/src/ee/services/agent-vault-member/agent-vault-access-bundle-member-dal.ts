import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

export type TAgentVaultAccessBundleMemberDALFactory = ReturnType<typeof agentVaultAccessBundleMemberDALFactory>;

export type TAgentVaultMemberActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
};

// Raw fields rather than a computed display name, matching the generic and PAM member lists: the
// frontend owns the "First Last, else username, else email" rule and can search across all of them.
export type TAgentVaultAccessBundleMemberDetail = {
  id: string;
  accessBundleId: string;
  userId: string | null;
  identityId: string | null;
  groupId: string | null;
  createdAt: Date;
  user: { username: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  identity: { name: string } | null;
  group: { name: string } | null;
};

export const agentVaultAccessBundleMemberDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultAccessBundleMember);

  // The reachability filter behind every member-facing read, and the hot half of session resolve.
  //
  // Group expansion branches on actor type rather than always joining user_group_membership: a machine
  // identity in a group inherits that group's bundles through identity_group_membership, and getting
  // this wrong denies every machine identity's group grants silently — an empty bundle list on a session
  // that looks perfectly healthy, for the product's primary actor.
  const findReachableAccessBundleIds = async (
    { projectId, actor }: { projectId: string; actor: TAgentVaultMemberActor },
    tx?: Knex
  ): Promise<string[]> => {
    try {
      const conn = tx || db.replicaNode();

      const rows = (await conn(TableName.AgentVaultAccessBundleMember)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundleMember}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .where((qb) => {
          if (actor.type === ActorType.USER) {
            void qb
              .where(`${TableName.AgentVaultAccessBundleMember}.userId`, actor.id)
              .orWhereIn(
                `${TableName.AgentVaultAccessBundleMember}.groupId`,
                conn(TableName.UserGroupMembership).where("userId", actor.id).select("groupId")
              );
          } else {
            void qb
              .where(`${TableName.AgentVaultAccessBundleMember}.identityId`, actor.id)
              .orWhereIn(
                `${TableName.AgentVaultAccessBundleMember}.groupId`,
                conn(TableName.IdentityGroupMembership).where("identityId", actor.id).select("groupId")
              );
          }
        })
        .distinct(`${TableName.AgentVaultAccessBundleMember}.accessBundleId`)) as { accessBundleId: string }[];

      return rows.map((row) => row.accessBundleId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find reachable agent vault access bundles" });
    }
  };

  // Members of one bundle, with enough of each actor to render a row without a second round trip.
  const findByAccessBundleId = async (
    accessBundleId: string,
    tx?: Knex
  ): Promise<TAgentVaultAccessBundleMemberDetail[]> => {
    try {
      const rows = (await (tx || db.replicaNode())(TableName.AgentVaultAccessBundleMember)
        .where(`${TableName.AgentVaultAccessBundleMember}.accessBundleId`, accessBundleId)
        .leftJoin(TableName.Users, `${TableName.AgentVaultAccessBundleMember}.userId`, `${TableName.Users}.id`)
        .leftJoin(
          TableName.Identity,
          `${TableName.AgentVaultAccessBundleMember}.identityId`,
          `${TableName.Identity}.id`
        )
        .leftJoin(TableName.Groups, `${TableName.AgentVaultAccessBundleMember}.groupId`, `${TableName.Groups}.id`)
        .select(
          db.ref("id").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("accessBundleId").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("userId").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("identityId").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("groupId").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("createdAt").withSchema(TableName.AgentVaultAccessBundleMember),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("name").withSchema(TableName.Groups).as("groupName")
        )
        .orderBy(`${TableName.AgentVaultAccessBundleMember}.createdAt`, "asc")) as {
        id: string;
        accessBundleId: string;
        userId: string | null;
        identityId: string | null;
        groupId: string | null;
        createdAt: Date;
        userUsername: string | null;
        userFirstName: string | null;
        userLastName: string | null;
        userEmail: string | null;
        identityName: string | null;
        groupName: string | null;
      }[];

      return rows.map((row) => ({
        id: row.id,
        accessBundleId: row.accessBundleId,
        userId: row.userId,
        identityId: row.identityId,
        groupId: row.groupId,
        createdAt: row.createdAt,
        user: row.userId
          ? {
              username: row.userUsername ?? "",
              email: row.userEmail,
              firstName: row.userFirstName,
              lastName: row.userLastName
            }
          : null,
        identity: row.identityId ? { name: row.identityName ?? "" } : null,
        group: row.groupId ? { name: row.groupName ?? "" } : null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle members" });
    }
  };

  const countByAccessBundleIds = async (accessBundleIds: string[], tx?: Knex): Promise<Record<string, number>> => {
    if (!accessBundleIds.length) return {};
    try {
      const rows = (await (tx || db.replicaNode())(TableName.AgentVaultAccessBundleMember)
        .whereIn("accessBundleId", accessBundleIds)
        .groupBy("accessBundleId")
        .select("accessBundleId")
        .count("id as count")) as { accessBundleId: string; count: string }[];

      return Object.fromEntries(rows.map((row) => [row.accessBundleId, parseInt(row.count, 10)]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault access bundle members" });
    }
  };

  // Grants are keyed on the bundle, which is keyed on the project, so scoping a reap to one project is a
  // subquery rather than a column on our own table.
  const bundleIdsInProject = (projectId: string, tx: Knex) =>
    tx(TableName.AgentVaultAccessBundle).where("projectId", projectId).select("id");

  const deleteActorGrantsInProject = async (
    { projectId, actorFilter }: { projectId: string; actorFilter: Record<string, string> },
    tx: Knex
  ) => {
    try {
      await tx(TableName.AgentVaultAccessBundleMember)
        .where(actorFilter)
        .whereIn("accessBundleId", bundleIdsInProject(projectId, tx))
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault grants for actor" });
    }
  };

  const deleteUserGrantsInProject = async (
    { projectId, userIds }: { projectId: string; userIds: string[] },
    tx: Knex
  ) => {
    try {
      await tx(TableName.AgentVaultAccessBundleMember)
        .whereIn("userId", userIds)
        .whereIn("accessBundleId", bundleIdsInProject(projectId, tx))
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete agent vault grants for users" });
    }
  };

  return {
    ...orm,
    findReachableAccessBundleIds,
    findByAccessBundleId,
    countByAccessBundleIds,
    deleteActorGrantsInProject,
    deleteUserGrantsInProject
  };
};
