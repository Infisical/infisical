import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TAgentVaultDelegations, TMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { AgentVaultDelegationScope } from "../agent-vault/agent-vault-enums";

export type TAgentVaultDelegationDALFactory = ReturnType<typeof agentVaultDelegationDALFactory>;
export type TAgentVaultDelegationSubjectDALFactory = ReturnType<typeof agentVaultDelegationSubjectDALFactory>;

export type TAgentVaultDelegationView = {
  id: string;
  machineIdentity: { id: string; name: string };
  scope: AgentVaultDelegationScope;
  users: {
    id: string;
    username: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    addedAt: Date;
  }[];
  groups: { id: string; name: string; addedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
};

const DELEGATION = TableName.AgentVaultDelegation;
const SUBJECTS = TableName.AgentVaultDelegationSubject;

/**
 * A selected delegation counts only while it names someone. Each subject cascades away with its Agent Vault membership,
 * which can empty one, and an empty one covers no one, so it reads exactly like no delegation at all.
 */
const whereNamesSomeone = (query: Knex.QueryBuilder, conn: Knex) =>
  query.where((live) => {
    void live
      .where(`${DELEGATION}.scope`, AgentVaultDelegationScope.AllMembers)
      .orWhereExists(
        conn(SUBJECTS).whereRaw(`??.?? = ??.??`, [SUBJECTS, "delegationId", DELEGATION, "id"]).select(conn.raw("1"))
      );
  });

export const agentVaultDelegationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultDelegation);

  // The row a conflict hits stays locked until the transaction ends, so two writes to one identity's delegation
  // run one after the other.
  const upsertScope = async (
    {
      projectId,
      identityId,
      membershipId,
      scope
    }: { projectId: string; identityId: string; membershipId: string; scope: AgentVaultDelegationScope },
    tx: Knex
  ): Promise<TAgentVaultDelegations> => {
    try {
      const [row] = (await tx(TableName.AgentVaultDelegation)
        .insert({ projectId, identityId, membershipId, scope })
        .onConflict("membershipId")
        .merge({ scope })
        .returning("*")) as TAgentVaultDelegations[];
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert Agent Vault delegation" });
    }
  };

  // Creates a selected delegation if the identity has none. One a concurrent save is still writing is waited for and
  // left as it is, so the caller locks and reads the row afterwards to see its committed scope.
  const insertSelectedIfMissing = async (
    { projectId, identityId, membershipId }: { projectId: string; identityId: string; membershipId: string },
    tx: Knex
  ) => {
    try {
      await tx(TableName.AgentVaultDelegation)
        .insert({ projectId, identityId, membershipId, scope: AgentVaultDelegationScope.Selected })
        .onConflict("membershipId")
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Create Agent Vault delegation" });
    }
  };

  // Adding or removing subjects writes only the subject rows, so this is what moves the delegation's updatedAt.
  const markChanged = async (delegationId: string, tx: Knex) => {
    try {
      await tx.raw(`UPDATE ?? SET "updatedAt" = now() WHERE id = ?`, [TableName.AgentVaultDelegation, delegationId]);
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark Agent Vault delegation changed" });
    }
  };

  // Returns how many were new: memberships the delegation already names are skipped.
  const insertSubjectsSkippingNamed = async (
    { delegationId, membershipIds }: { delegationId: string; membershipIds: string[] },
    tx: Knex
  ) => {
    if (!membershipIds.length) return 0;
    try {
      const rows = await tx(SUBJECTS)
        .insert(membershipIds.map((membershipId) => ({ delegationId, membershipId })))
        .onConflict(["membershipId", "delegationId"])
        .ignore()
        .returning("id");
      return rows.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "Add Agent Vault delegation subjects" });
    }
  };

  // A selected delegation whose subjects all left reads as none, so a save replaces it rather than reviving it with its
  // old createdAt.
  const deleteIfNamesNoOne = async ({ projectId, identityId }: { projectId: string; identityId: string }, tx: Knex) => {
    try {
      await tx(DELEGATION)
        .where(`${DELEGATION}.projectId`, projectId)
        .where(`${DELEGATION}.identityId`, identityId)
        .where(`${DELEGATION}.scope`, AgentVaultDelegationScope.Selected)
        .whereNotExists(
          tx(SUBJECTS).whereRaw(`??.?? = ??.??`, [SUBJECTS, "delegationId", DELEGATION, "id"]).select(tx.raw("1"))
        )
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete emptied Agent Vault delegation" });
    }
  };

  // The delegation row, locked until the transaction ends, so an add or a remove can't interleave with a save.
  const lockForIdentity = async ({ projectId, identityId }: { projectId: string; identityId: string }, tx: Knex) => {
    try {
      return (await tx(DELEGATION).where({ projectId, identityId }).forUpdate().first()) as
        | TAgentVaultDelegations
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock Agent Vault delegation" });
    }
  };

  // Takes the named users and groups out of one delegation. Names it doesn't hold are skipped.
  const removeSubjectsByActors = async (
    { delegationId, userIds, groupIds }: { delegationId: string; userIds: string[]; groupIds: string[] },
    tx: Knex
  ) => {
    if (!userIds.length && !groupIds.length) return 0;
    try {
      return await tx(SUBJECTS)
        .where(`${SUBJECTS}.delegationId`, delegationId)
        .whereIn(
          `${SUBJECTS}.membershipId`,
          tx(TableName.Membership)
            .where((actor) => {
              if (userIds.length) void actor.orWhereIn(`${TableName.Membership}.actorUserId`, userIds);
              if (groupIds.length) void actor.orWhereIn(`${TableName.Membership}.actorGroupId`, groupIds);
            })
            .select(`${TableName.Membership}.id`)
        )
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Remove users and groups from an Agent Vault delegation" });
    }
  };

  const findViews = async (
    {
      projectId,
      identityIds,
      limit,
      offset = 0
    }: { projectId: string; identityIds?: string[]; limit?: number; offset?: number },
    tx?: Knex
  ): Promise<{ delegations: TAgentVaultDelegationView[]; totalCount: number }> => {
    try {
      const conn = tx || db.replicaNode();
      const filtered = () => {
        const query = conn(TableName.AgentVaultDelegation).where(
          `${TableName.AgentVaultDelegation}.projectId`,
          projectId
        );
        if (identityIds) void query.whereIn(`${TableName.AgentVaultDelegation}.identityId`, identityIds);
        return whereNamesSomeone(query, conn);
      };

      const countResult = (await filtered().count(`${TableName.AgentVaultDelegation}.id as count`).first()) as
        | { count: string }
        | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const pageQuery = filtered()
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.AgentVaultDelegation}.identityId`)
        .select(
          selectAllTableCols(TableName.AgentVaultDelegation),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
        )
        .orderBy(`${TableName.Identity}.name`, "asc")
        .orderBy(`${TableName.AgentVaultDelegation}.id`, "asc");
      if (limit !== undefined) void pageQuery.limit(limit).offset(offset);
      const rows = (await pageQuery) as (TAgentVaultDelegations & { identityName: string })[];
      if (!rows.length) return { delegations: [], totalCount };

      const subjects = (await conn(TableName.AgentVaultDelegationSubject)
        .whereIn(
          `${TableName.AgentVaultDelegationSubject}.delegationId`,
          rows.map((row) => row.id)
        )
        .join(
          TableName.Membership,
          `${TableName.Membership}.id`,
          `${TableName.AgentVaultDelegationSubject}.membershipId`
        )
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .leftJoin(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .select(
          db.ref("delegationId").withSchema(TableName.AgentVaultDelegationSubject),
          db.ref("actorUserId").withSchema(TableName.Membership).as("userId"),
          db.ref("actorGroupId").withSchema(TableName.Membership).as("groupId"),
          db.ref("createdAt").withSchema(TableName.AgentVaultDelegationSubject).as("addedAt"),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("name").withSchema(TableName.Groups).as("groupName")
        )
        .orderBy(`${TableName.Users}.username`, "asc")
        .orderBy(`${TableName.Groups}.name`, "asc")) as {
        delegationId: string;
        userId: string | null;
        groupId: string | null;
        username: string | null;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        groupName: string | null;
        addedAt: Date;
      }[];

      const delegations = rows.map((row): TAgentVaultDelegationView => ({
        id: row.id,
        machineIdentity: { id: row.identityId, name: row.identityName },
        scope: row.scope as AgentVaultDelegationScope,
        users: subjects
          .filter((subject) => subject.delegationId === row.id && subject.userId && subject.username)
          .map((subject) => ({
            id: subject.userId!,
            username: subject.username!,
            email: subject.email,
            firstName: subject.firstName,
            lastName: subject.lastName,
            addedAt: subject.addedAt
          })),
        groups: subjects
          .filter((subject) => subject.delegationId === row.id && subject.groupId && subject.groupName)
          .map((subject) => ({ id: subject.groupId!, name: subject.groupName!, addedAt: subject.addedAt })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }));

      return { delegations, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Agent Vault delegations" });
    }
  };

  /**
   * Under all-members every user is covered, otherwise the users the delegation names and the members of the groups
   * it names. Group membership is read the way the permission engine reads it, without isPending. A subject exists
   * only while its user's or group's own Agent Vault membership does, so this needs no membership check of its own.
   */
  const coversUser = async (
    { delegation, userId }: { delegation: Pick<TAgentVaultDelegations, "id" | "scope">; userId: string },
    tx?: Knex
  ): Promise<boolean> => {
    if (delegation.scope === AgentVaultDelegationScope.AllMembers) return true;
    try {
      const conn = tx || db.replicaNode();
      const subject = await conn(SUBJECTS)
        .join(TableName.Membership, `${TableName.Membership}.id`, `${SUBJECTS}.membershipId`)
        .where(`${SUBJECTS}.delegationId`, delegation.id)
        .where((qb) => {
          void qb
            .where(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(
              `${TableName.Membership}.actorGroupId`,
              conn(TableName.UserGroupMembership).select("groupId").where({ userId })
            );
        })
        .select(db.ref("id").withSchema(SUBJECTS))
        .first();
      return Boolean(subject);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check Agent Vault delegation coverage" });
    }
  };

  // Undefined when the identity has no delegation, or only one left naming no one.
  const findForIdentity = async (
    { projectId, identityId }: { projectId: string; identityId: string },
    tx?: Knex
  ): Promise<TAgentVaultDelegations | undefined> => {
    try {
      const conn = tx || db.replicaNode();
      return (await whereNamesSomeone(
        conn(DELEGATION).where(`${DELEGATION}.projectId`, projectId).where(`${DELEGATION}.identityId`, identityId),
        conn
      )
        .select(selectAllTableCols(DELEGATION))
        .first()) as TAgentVaultDelegations | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Agent Vault delegation" });
    }
  };

  // False when the identity has no delegation at all.
  const identityCoversUser = async (
    { projectId, identityId, userId }: { projectId: string; identityId: string; userId: string },
    tx?: Knex
  ): Promise<boolean> => {
    const delegation = await findForIdentity({ projectId, identityId }, tx);
    return delegation ? coversUser({ delegation, userId }, tx) : false;
  };

  /**
   * The Agent Vault memberships of the identity and of the users and groups a save names, taken FOR SHARE. Removing a
   * member deletes its row in a transaction of its own, so a save waits for a removal in flight and then sees the row
   * gone, and a removal that starts later waits for the save and then clears what it wrote. The identity, user and
   * group rows are taken FOR KEY SHARE first, the lock the save's foreign keys take anyway: deleting one of them
   * deletes it before the cascade reaches its memberships, so locking in that order keeps the two from deadlocking.
   */
  const lockMemberships = async (
    {
      projectId,
      identityId,
      userIds,
      groupIds
    }: { projectId: string; identityId: string; userIds: string[]; groupIds: string[] },
    tx: Knex
  ) => {
    try {
      await tx(TableName.Identity).where({ id: identityId }).forKeyShare().select("id");
      if (userIds.length) await tx(TableName.Users).whereIn("id", userIds).orderBy("id").forKeyShare().select("id");
      if (groupIds.length) await tx(TableName.Groups).whereIn("id", groupIds).orderBy("id").forKeyShare().select("id");
      return (await tx(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where((actor) => {
          void actor.where(`${TableName.Membership}.actorIdentityId`, identityId);
          if (userIds.length) void actor.orWhereIn(`${TableName.Membership}.actorUserId`, userIds);
          if (groupIds.length) void actor.orWhereIn(`${TableName.Membership}.actorGroupId`, groupIds);
        })
        // In id order, the order a removal of several memberships locks them in (lockMembershipsById) before it
        // deletes, so the two can't each wait on the other.
        .orderBy(`${TableName.Membership}.id`)
        .forShare()
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("actorIdentityId").withSchema(TableName.Membership),
          db.ref("actorUserId").withSchema(TableName.Membership),
          db.ref("actorGroupId").withSchema(TableName.Membership)
        )) as Pick<TMemberships, "id" | "actorIdentityId" | "actorUserId" | "actorGroupId">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock Agent Vault memberships for a delegation" });
    }
  };

  return {
    ...orm,
    upsertScope,
    insertSelectedIfMissing,
    markChanged,
    insertSubjectsSkippingNamed,
    deleteIfNamesNoOne,
    lockForIdentity,
    removeSubjectsByActors,
    findViews,
    coversUser,
    findForIdentity,
    identityCoversUser,
    lockMemberships
  };
};

export const agentVaultDelegationSubjectDALFactory = (db: TDbClient) =>
  ormify(db, TableName.AgentVaultDelegationSubject);
