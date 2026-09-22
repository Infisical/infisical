import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";

export type TAgentVaultMemberDALFactory = ReturnType<typeof agentVaultMemberDALFactory>;

export type TAgentVaultProductActor =
  | {
      type: AgentVaultMemberType.User;
      id: string;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      isOrgMembershipPending: boolean;
    }
  | {
      type: AgentVaultMemberType.MachineIdentity;
      id: string;
      name: string;
      // An identity Agent Vault created cannot be detached, only deleted.
      isManagedByAgentVault: boolean;
      orgId: string | null;
    }
  | { type: AgentVaultMemberType.Group; id: string; name: string };

export type TAgentVaultProductMember = {
  id: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  actor: TAgentVaultProductActor;
};

const ACTOR_COLUMN: Record<AgentVaultMemberType, "actorUserId" | "actorIdentityId" | "actorGroupId"> = {
  [AgentVaultMemberType.User]: "actorUserId",
  [AgentVaultMemberType.MachineIdentity]: "actorIdentityId",
  [AgentVaultMemberType.Group]: "actorGroupId"
};

type TActorRow = {
  userId: string | null;
  machineIdentityId: string | null;
  groupId: string | null;
  userUsername: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  machineIdentityName: string | null;
  machineIdentityProjectId: string | null;
  machineIdentityOrgId: string | null;
  groupName: string | null;
  isOrgMembershipPending: boolean;
};

const actorOf = (row: TActorRow, projectId: string): TAgentVaultProductActor => {
  if (row.machineIdentityId) {
    return {
      type: AgentVaultMemberType.MachineIdentity,
      id: row.machineIdentityId,
      name: row.machineIdentityName ?? "",
      isManagedByAgentVault: row.machineIdentityProjectId === projectId,
      orgId: row.machineIdentityOrgId
    };
  }
  if (row.groupId) {
    return { type: AgentVaultMemberType.Group, id: row.groupId, name: row.groupName ?? "" };
  }
  return {
    type: AgentVaultMemberType.User,
    id: row.userId ?? "",
    username: row.userUsername ?? "",
    email: row.userEmail,
    firstName: row.userFirstName,
    lastName: row.userLastName,
    isOrgMembershipPending: row.isOrgMembershipPending
  };
};

type TFindProductMembersDTO = {
  projectId: string;
  orgId: string;
  actorTypes: AgentVaultMemberType[];
  search?: string;
  limit: number;
  offset: number;
};

type TFindAvailableActorsDTO = TFindProductMembersDTO;

export const agentVaultMemberDALFactory = (db: TDbClient) => {
  const findProductMembers = async (
    { projectId, orgId, actorTypes, search, limit, offset }: TFindProductMembersDTO,
    tx?: Knex
  ): Promise<{ members: TAgentVaultProductMember[]; totalCount: number }> => {
    if (!actorTypes.length) return { members: [], totalCount: 0 };

    try {
      const conn = tx || db.replicaNode();

      const applyFilters = (query: Knex.QueryBuilder) => {
        void query
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          // only_one_actor_type keeps at most one non-null, so these cannot multiply a row and the count can
          // carry them. Nothing else may be joined: membership_roles is one-to-many and would.
          .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
          .leftJoin(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`);

        void query.where((qb) => {
          actorTypes.forEach((type) => {
            void qb.orWhereNotNull(`${TableName.Membership}.${ACTOR_COLUMN[type]}`);
          });
        });

        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.Users}.username`, term)
              .orWhereILike(`${TableName.Users}.email`, term)
              .orWhereRaw(`CONCAT_WS(' ', ??, ??) ILIKE ?`, [
                `${TableName.Users}.firstName`,
                `${TableName.Users}.lastName`,
                term
              ])
              .orWhereILike(`${TableName.Identity}.name`, term)
              .orWhereILike(`${TableName.Groups}.name`, term);
          });
        }
        return query;
      };

      const countResult = (await applyFilters(conn(TableName.Membership))
        .count(`${TableName.Membership}.id as count`)
        .first()) as { count: string } | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const rows = (await applyFilters(conn(TableName.Membership))
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("isActive").withSchema(TableName.Membership),
          db.ref("actorUserId").withSchema(TableName.Membership).as("userId"),
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("machineIdentityId"),
          db.ref("actorGroupId").withSchema(TableName.Membership).as("groupId"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("name").withSchema(TableName.Identity).as("machineIdentityName"),
          db.ref("projectId").withSchema(TableName.Identity).as("machineIdentityProjectId"),
          db.ref("orgId").withSchema(TableName.Identity).as("machineIdentityOrgId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.raw(
            `(SELECT mr."role" FROM ?? mr WHERE mr."membershipId" = ??."id" ORDER BY mr."createdAt" ASC LIMIT 1) as "role"`,
            [TableName.MembershipRole, TableName.Membership]
          ),
          // Pinned to this org: membership is unique per (org, actor), and a user can hold several in a sub-org family.
          db.raw(
            `EXISTS (SELECT 1 FROM ?? om WHERE om."scope" = ? AND om."scopeOrgId" = ?
               AND om."actorUserId" = ??."actorUserId" AND om."status" = ?) as "isOrgMembershipPending"`,
            [TableName.Membership, AccessScope.Organization, orgId, TableName.Membership, OrgMembershipStatus.Invited]
          )
        )
        .orderByRaw(`COALESCE(??, ??, ??, '') ASC`, [
          `${TableName.Users}.username`,
          `${TableName.Identity}.name`,
          `${TableName.Groups}.name`
        ])
        .orderBy(`${TableName.Membership}.id`, "asc")
        .limit(limit)
        .offset(offset)) as {
        id: string;
        createdAt: Date;
        isActive: boolean;
        userId: string | null;
        machineIdentityId: string | null;
        groupId: string | null;
        userUsername: string | null;
        userEmail: string | null;
        userFirstName: string | null;
        userLastName: string | null;
        machineIdentityName: string | null;
        machineIdentityProjectId: string | null;
        machineIdentityOrgId: string | null;
        groupName: string | null;
        role: string | null;
        isOrgMembershipPending: boolean;
      }[];

      return {
        members: rows.map((row) => ({
          id: row.id,
          role: row.role ?? ProjectMembershipRole.Member,
          isActive: row.isActive,
          createdAt: row.createdAt,
          actor: actorOf(row, projectId)
        })),
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault product members" });
    }
  };

  // Every rule here mirrors one in assertActorsAreAddable, so the picker cannot offer an actor the add
  // path would then refuse.
  const findAvailableActors = async (
    { projectId, orgId, actorTypes, search, limit, offset }: TFindAvailableActorsDTO,
    tx?: Knex
  ): Promise<{ actors: TAgentVaultProductActor[]; totalCount: number }> => {
    if (!actorTypes.length) return { actors: [], totalCount: 0 };

    try {
      const conn = tx || db.replicaNode();

      const alreadyMembers = (column: (typeof ACTOR_COLUMN)[AgentVaultMemberType]) =>
        conn(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .whereNotNull(`${TableName.Membership}.${column}`)
          .select(column);

      const applyFilters = (query: Knex.QueryBuilder) => {
        void query
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          // A deactivated org member is refused by the add path.
          .where(`${TableName.Membership}.isActive`, true)
          .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
          .leftJoin(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`);

        void query.where((qb) => {
          actorTypes.forEach((type) => {
            void qb.orWhere((typeQb) => {
              const column = ACTOR_COLUMN[type];
              void typeQb
                .whereNotNull(`${TableName.Membership}.${column}`)
                .whereNotIn(`${TableName.Membership}.${column}`, alreadyMembers(column));

              // A ghost user backs a legacy E2EE project, not a person.
              if (type === AgentVaultMemberType.User) {
                void typeQb.where(`${TableName.Users}.isGhost`, false);
              }

              // A project-scoped identity belongs to one product. Another product's is refused by the add
              // path, and Agent Vault's own is already a member, since the only way to remove one is to
              // delete it.
              if (type === AgentVaultMemberType.MachineIdentity) {
                void typeQb.whereNull(`${TableName.Identity}.projectId`);
              }
            });
          });
        });

        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.Users}.username`, term)
              .orWhereILike(`${TableName.Users}.email`, term)
              .orWhereRaw(`CONCAT_WS(' ', ??, ??) ILIKE ?`, [
                `${TableName.Users}.firstName`,
                `${TableName.Users}.lastName`,
                term
              ])
              .orWhereILike(`${TableName.Identity}.name`, term)
              .orWhereILike(`${TableName.Groups}.name`, term);
          });
        }
        return query;
      };

      const countResult = (await applyFilters(conn(TableName.Membership))
        .count(`${TableName.Membership}.id as count`)
        .first()) as { count: string } | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const rows = (await applyFilters(conn(TableName.Membership))
        .select(
          db.ref("actorUserId").withSchema(TableName.Membership).as("userId"),
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("machineIdentityId"),
          db.ref("actorGroupId").withSchema(TableName.Membership).as("groupId"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("name").withSchema(TableName.Identity).as("machineIdentityName"),
          db.ref("projectId").withSchema(TableName.Identity).as("machineIdentityProjectId"),
          db.ref("orgId").withSchema(TableName.Identity).as("machineIdentityOrgId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          // status is nullable and the response schema takes a boolean. The member query reads this through
          // EXISTS, which cannot be null; this one compares the column, so it has to coalesce.
          db.raw(`COALESCE(??."status" = ?, false) as "isOrgMembershipPending"`, [
            TableName.Membership,
            OrgMembershipStatus.Invited
          ])
        )
        .orderByRaw(`COALESCE(??, ??, ??, '') ASC`, [
          `${TableName.Users}.username`,
          `${TableName.Identity}.name`,
          `${TableName.Groups}.name`
        ])
        .orderBy(`${TableName.Membership}.id`, "asc")
        .limit(limit)
        .offset(offset)) as TActorRow[];

      return { actors: rows.map((row) => actorOf(row, projectId)), totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find available agent vault actors" });
    }
  };

  return { findProductMembers, findAvailableActors };
};
