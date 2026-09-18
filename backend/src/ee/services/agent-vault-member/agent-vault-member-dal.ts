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
      // Agent Vault owns identities it created, and those cannot be detached, only deleted. The caller
      // has to know which it is holding before it offers a button.
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

type TFindProductMembersDTO = {
  projectId: string;
  orgId: string;
  actorTypes: AgentVaultMemberType[];
  search?: string;
  limit: number;
  offset: number;
};

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
          // Joined on the primary keys, and only_one_actor_type keeps at most one of the three non-null,
          // so none of these can multiply a row. That is what lets the count query carry them, which the
          // search needs. Nothing else may be joined here: membership_roles is one-to-many and would.
          .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
          .leftJoin(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`);

        // The caller sees only the actor kinds their role lets them read, and the count is filtered the
        // same way, so the pager never promises a page it will not serve.
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
              // Covers a first name, a last name and the two together, so no separate checks are needed.
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
          // A subselect rather than a join: membership_roles allows several rows per membership and this
          // product writes one, so joining would multiply the row and split a member across a page.
          db.raw(`(SELECT mr."role" FROM ?? mr WHERE mr."membershipId" = ??."id" LIMIT 1) as "role"`, [
            TableName.MembershipRole,
            TableName.Membership
          ]),
          // Pinned to this org: membership is unique per (org, actor) rather than per actor, and a user
          // can hold memberships in several orgs of a sub-org family.
          db.raw(
            `EXISTS (SELECT 1 FROM ?? om WHERE om."scope" = ? AND om."scopeOrgId" = ?
               AND om."actorUserId" = ??."actorUserId" AND om."status" = ?) as "isOrgMembershipPending"`,
            [TableName.Membership, AccessScope.Organization, orgId, TableName.Membership, OrgMembershipStatus.Invited]
          )
        )
        // Ordered by the name the table renders, so a page is the page the reader expects. The membership
        // id breaks ties: createdAt defaults to the transaction's start time, so a bulk add writes up to a
        // hundred rows sharing one timestamp, and two members sharing a name would otherwise straddle a
        // page boundary and appear twice or not at all.
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

      const actorOf = (row: (typeof rows)[number]): TAgentVaultProductActor => {
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

      return {
        members: rows.map((row) => ({
          id: row.id,
          role: row.role ?? ProjectMembershipRole.Member,
          isActive: row.isActive,
          createdAt: row.createdAt,
          actor: actorOf(row)
        })),
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault product members" });
    }
  };

  return { findProductMembers };
};
