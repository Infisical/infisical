import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import {
  AGENT_VAULT_ACTOR_COLUMN,
  AgentVaultMemberType,
  TAgentVaultActorColumn
} from "@app/ee/services/agent-vault/agent-vault-enums";
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

export type TAgentVaultProductMember = TAgentVaultProductActor & {
  // Built-in slugs (admin, no-access) and custom role slugs, oldest first.
  roles: string[];
  isActive: boolean;
  addedAt: Date;
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
  // Set to list the members who don't hold that role yet.
  excludeRoleId?: string;
  // Set to list the members who could still be added to that delegation.
  excludeDelegationId?: string;
  // Set to list only these machine identities.
  identityIds?: string[];
};

type TFindAvailableActorsDTO = Omit<TFindProductMembersDTO, "excludeRoleId" | "excludeDelegationId">;

export const agentVaultMemberDALFactory = (db: TDbClient) => {
  const findProductMembers = async (
    {
      projectId,
      orgId,
      actorTypes,
      search,
      limit,
      offset,
      excludeRoleId,
      excludeDelegationId,
      identityIds
    }: TFindProductMembersDTO,
    tx?: Knex
  ): Promise<{ members: TAgentVaultProductMember[]; totalCount: number }> => {
    if (!actorTypes.length) return { members: [], totalCount: 0 };

    try {
      const conn = tx || db.replicaNode();

      const alreadyGranted = (column: TAgentVaultActorColumn) =>
        conn(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .where(`${TableName.MembershipRole}.customRoleId`, excludeRoleId!)
          .whereNotNull(`${TableName.Membership}.${column}`)
          .select(`${TableName.Membership}.${column}`);

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
            const column = AGENT_VAULT_ACTOR_COLUMN[type];
            void qb.orWhere((typeQb) => {
              void typeQb.whereNotNull(`${TableName.Membership}.${column}`);
              // Inside the block, where the column is known non-null: a bare whereNotIn would read
              // NULL NOT IN (...) as NULL for the other two types and drop every one of their rows.
              if (excludeRoleId) {
                void typeQb.whereNotIn(`${TableName.Membership}.${column}`, alreadyGranted(column));
              }
              if (identityIds && type === AgentVaultMemberType.MachineIdentity) {
                void typeQb.whereIn(`${TableName.Membership}.${column}`, identityIds);
              }
            });
          });
        });

        // A delegation names a member by its membership row, so this needs no per-type column.
        if (excludeDelegationId) {
          void query.whereNotExists(
            conn(TableName.AgentVaultDelegationSubject)
              .where(`${TableName.AgentVaultDelegationSubject}.delegationId`, excludeDelegationId)
              .whereRaw(`??.?? = ??.??`, [
                TableName.AgentVaultDelegationSubject,
                "membershipId",
                TableName.Membership,
                "id"
              ])
              .select(conn.raw("1"))
          );
        }

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
            `(SELECT COALESCE(array_agg(COALESCE(r."slug", mr."role") ORDER BY mr."createdAt" ASC, mr."id" ASC), '{}')
               FROM ?? mr LEFT JOIN ?? r ON r."id" = mr."customRoleId" WHERE mr."membershipId" = ??."id") as "roles"`,
            [TableName.MembershipRole, TableName.Role, TableName.Membership]
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
        roles: string[];
        isOrgMembershipPending: boolean;
      }[];

      return {
        members: rows.map((row) => ({
          ...actorOf(row, projectId),
          roles: row.roles,
          isActive: row.isActive,
          addedAt: row.createdAt
        })),
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault product members" });
    }
  };

  // Every rule here mirrors one in assertActorsAreAddable, so the picker cannot offer an actor the add
  // path would then refuse. Group-only users and identities get a synthetic row shaped and aliased like
  // the memberships table, so the same filters cover them.
  const findAvailableActors = async (
    { projectId, orgId, actorTypes, search, limit, offset, identityIds }: TFindAvailableActorsDTO,
    tx?: Knex
  ): Promise<{ actors: TAgentVaultProductActor[]; totalCount: number }> => {
    if (!actorTypes.length) return { actors: [], totalCount: 0 };

    try {
      const conn = tx || db.replicaNode();

      const alreadyMembers = (column: TAgentVaultActorColumn) =>
        conn(TableName.Membership)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .whereNotNull(`${TableName.Membership}.${column}`)
          .select(column);

      const m = TableName.Membership;
      const orgActors = () => {
        const direct = conn(m)
          .where(`${m}.scope`, AccessScope.Organization)
          .where(`${m}.scopeOrgId`, orgId)
          .select(
            `${m}.id`,
            `${m}.scope`,
            `${m}.scopeOrgId`,
            `${m}.isActive`,
            `${m}.status`,
            `${m}.actorUserId`,
            `${m}.actorIdentityId`,
            `${m}.actorGroupId`
          );
        const viaGroupOnly = (
          groupTable: TableName.UserGroupMembership | TableName.IdentityGroupMembership,
          groupActorColumn: "userId" | "identityId",
          actorColumn: "actorUserId" | "actorIdentityId"
        ) =>
          conn(groupTable)
            .join(`${m} as groupOrg`, "groupOrg.actorGroupId", `${groupTable}.groupId`)
            .where("groupOrg.scope", AccessScope.Organization)
            .where("groupOrg.scopeOrgId", orgId)
            .where("groupOrg.isActive", true)
            .whereNotExists(
              conn(`${m} as directRow`)
                .select(conn.raw("1"))
                .where("directRow.scope", AccessScope.Organization)
                .where("directRow.scopeOrgId", orgId)
                .whereRaw("?? = ??", [`directRow.${actorColumn}`, `${groupTable}.${groupActorColumn}`])
            )
            .distinct(
              db.ref(groupActorColumn).withSchema(groupTable).as("id"),
              db.raw("?::text as scope", [AccessScope.Organization]),
              db.raw(`?::uuid as "scopeOrgId"`, [orgId]),
              db.raw(`true as "isActive"`),
              db.raw("null::text as status"),
              actorColumn === "actorUserId"
                ? db.ref(groupActorColumn).withSchema(groupTable).as("actorUserId")
                : db.raw(`null::uuid as "actorUserId"`),
              actorColumn === "actorIdentityId"
                ? db.ref(groupActorColumn).withSchema(groupTable).as("actorIdentityId")
                : db.raw(`null::uuid as "actorIdentityId"`),
              db.raw(`null::uuid as "actorGroupId"`)
            );

        return conn.from(
          direct
            .unionAll([
              viaGroupOnly(TableName.UserGroupMembership, "userId", "actorUserId"),
              viaGroupOnly(TableName.IdentityGroupMembership, "identityId", "actorIdentityId")
            ])
            .as(m)
        );
      };

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
              const column = AGENT_VAULT_ACTOR_COLUMN[type];
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
                if (identityIds) void typeQb.whereIn(`${TableName.Membership}.${column}`, identityIds);
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

      const countResult = (await applyFilters(orgActors()).count(`${TableName.Membership}.id as count`).first()) as
        | { count: string }
        | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const rows = (await applyFilters(orgActors())
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

  // Every machine identity in the org, directly or only through a group, as findAvailableActors reaches them: the
  // candidates an identity read limited to some identities is worked out over.
  const findOrgIdentityIds = async (orgId: string, tx?: Knex): Promise<string[]> => {
    try {
      const conn = tx || db.replicaNode();
      const rows = (await conn(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .select(conn.ref("actorIdentityId").withSchema(TableName.Membership).as("id"))
        .union([
          conn(TableName.IdentityGroupMembership)
            .join(
              `${TableName.Membership} as groupOrg`,
              "groupOrg.actorGroupId",
              `${TableName.IdentityGroupMembership}.groupId`
            )
            .where("groupOrg.scope", AccessScope.Organization)
            .where("groupOrg.scopeOrgId", orgId)
            .select(conn.ref("identityId").withSchema(TableName.IdentityGroupMembership).as("id"))
        ])) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault org identity ids" });
    }
  };

  return { findProductMembers, findAvailableActors, findOrgIdentityIds };
};
