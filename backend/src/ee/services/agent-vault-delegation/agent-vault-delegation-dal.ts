import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultDelegations } from "@app/db/schemas";
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

export const agentVaultDelegationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultDelegation);

  // The row a conflict hits stays locked until the transaction ends, so two writes to one identity's delegation
  // run one after the other.
  const upsertScope = async (
    { projectId, identityId, scope }: { projectId: string; identityId: string; scope: AgentVaultDelegationScope },
    tx: Knex
  ): Promise<TAgentVaultDelegations> => {
    try {
      const [row] = (await tx(TableName.AgentVaultDelegation)
        .insert({ projectId, identityId, scope })
        .onConflict(["identityId", "projectId"])
        .merge({ scope })
        .returning("*")) as TAgentVaultDelegations[];
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert Agent Vault delegation" });
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
        return query;
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
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.AgentVaultDelegationSubject}.userId`)
        .leftJoin(TableName.Groups, `${TableName.Groups}.id`, `${TableName.AgentVaultDelegationSubject}.groupId`)
        .select(
          db.ref("delegationId").withSchema(TableName.AgentVaultDelegationSubject),
          db.ref("userId").withSchema(TableName.AgentVaultDelegationSubject),
          db.ref("groupId").withSchema(TableName.AgentVaultDelegationSubject),
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

      const delegations = rows.map(
        (row): TAgentVaultDelegationView => ({
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
        })
      );

      return { delegations, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Agent Vault delegations" });
    }
  };

  /**
   * Under all-members every user is covered, otherwise the users the delegation names and the members of the groups
   * it names. Group membership is read the way the permission engine reads it, without isPending.
   */
  const coversUser = async (
    { delegation, userId }: { delegation: Pick<TAgentVaultDelegations, "id" | "scope">; userId: string },
    tx?: Knex
  ): Promise<boolean> => {
    if (delegation.scope === AgentVaultDelegationScope.AllMembers) return true;
    try {
      const conn = tx || db.replicaNode();
      const subject = await conn(TableName.AgentVaultDelegationSubject)
        .where(`${TableName.AgentVaultDelegationSubject}.delegationId`, delegation.id)
        .where((qb) => {
          void qb
            .where(`${TableName.AgentVaultDelegationSubject}.userId`, userId)
            .orWhereIn(
              `${TableName.AgentVaultDelegationSubject}.groupId`,
              conn(TableName.UserGroupMembership).select("groupId").where({ userId })
            );
        })
        .select(db.ref("id").withSchema(TableName.AgentVaultDelegationSubject))
        .first();
      return Boolean(subject);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check Agent Vault delegation coverage" });
    }
  };

  // False when the identity has no delegation at all.
  const identityCoversUser = async (
    { projectId, identityId, userId }: { projectId: string; identityId: string; userId: string },
    tx?: Knex
  ): Promise<boolean> => {
    let delegation: TAgentVaultDelegations | undefined;
    try {
      delegation = (await (tx || db.replicaNode())(TableName.AgentVaultDelegation)
        .where({ projectId, identityId })
        .first()) as TAgentVaultDelegations | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find Agent Vault delegation" });
    }
    return delegation ? coversUser({ delegation, userId }, tx) : false;
  };

  return { ...orm, upsertScope, findViews, coversUser, identityCoversUser };
};

export const agentVaultDelegationSubjectDALFactory = (db: TDbClient) =>
  ormify(db, TableName.AgentVaultDelegationSubject);
