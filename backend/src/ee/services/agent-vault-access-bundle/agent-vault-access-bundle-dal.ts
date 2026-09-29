import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { RESOURCE_SCOPE, ResourceType, TableName, TAgentVaultAccessBundles } from "@app/db/schemas";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

export type TAgentVaultAccessBundleDALFactory = ReturnType<typeof agentVaultAccessBundleDALFactory>;

export type TAgentVaultAccessBundleListRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  serviceCount: number;
  hostPatterns: string[];
  memberCount: number;
};

export type TAgentVaultAccessBundleActorRef = {
  type: AgentVaultMemberType;
  id: string;
};

export type TAgentVaultAccessBundleActor =
  | {
      type: AgentVaultMemberType.User;
      id: string;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | { type: AgentVaultMemberType.MachineIdentity; id: string; name: string }
  | { type: AgentVaultMemberType.Group; id: string; name: string };

export type TAgentVaultAccessBundleMemberDetail = {
  id: string;
  accessBundleId: string;
  createdAt: Date;
  actor: TAgentVaultAccessBundleActor;
};

export type TAgentVaultAccessBundleOrderBy = "name" | "serviceCount" | "createdAt";

type TFindAccessBundlesDTO = {
  projectId: string;
  accessBundleIds: string[] | null;
  search?: string;
  orderBy: TAgentVaultAccessBundleOrderBy;
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};

const grantScope = (projectId: string, accessBundleId?: string) => ({
  scope: RESOURCE_SCOPE,
  scopeProjectId: projectId,
  scopeResourceType: ResourceType.AgentVaultAccessBundle,
  ...(accessBundleId ? { scopeResourceId: accessBundleId } : {})
});

export const agentVaultAccessBundleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultAccessBundle);

  const findForList = async (
    { projectId, accessBundleIds, search, orderBy, orderDirection, limit, offset }: TFindAccessBundlesDTO,
    tx?: Knex
  ): Promise<{ accessBundles: TAgentVaultAccessBundleListRow[]; totalCount: number }> => {
    if (accessBundleIds?.length === 0) return { accessBundles: [], totalCount: 0 };

    try {
      const conn = tx || db.replicaNode();

      // The page is chosen before the service join, which fans a bundle out per service: a LIMIT over that
      // would cut a bundle's services rather than the bundle list.
      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId);
        if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.AgentVaultAccessBundle}.name`, term)
              .orWhereILike(`${TableName.AgentVaultAccessBundle}.description`, term);
          });
        }
        return query;
      };

      const countResult = (await applyFilters(conn(TableName.AgentVaultAccessBundle))
        .count(`${TableName.AgentVaultAccessBundle}.id as count`)
        .first()) as { count: string } | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const serviceCounts = conn(TableName.AgentVaultService)
        .select("accessBundleId")
        .count("* as count")
        .groupBy("accessBundleId")
        .as("sc");

      const pageQuery = applyFilters(conn(TableName.AgentVaultAccessBundle))
        .leftJoin(serviceCounts, function joinServiceCount() {
          this.on(db.raw(`sc."accessBundleId" = ??.id`, [TableName.AgentVaultAccessBundle]));
        })
        .limit(limit)
        .offset(offset)
        .select(db.ref("id").withSchema(TableName.AgentVaultAccessBundle));

      if (orderBy === "serviceCount") {
        void pageQuery.orderByRaw(`COALESCE(sc.count, 0) ${orderDirection === "desc" ? "DESC" : "ASC"}`);
      } else {
        void pageQuery.orderBy(`${TableName.AgentVaultAccessBundle}.${orderBy}`, orderDirection);
      }
      void pageQuery.orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc");

      const pageIds = ((await pageQuery) as { id: string }[]).map((row) => row.id);
      if (!pageIds.length) return { accessBundles: [], totalCount };

      const memberCounts = conn(TableName.Membership)
        .select("scopeResourceId")
        .where({ ...grantScope(projectId), isActive: true })
        .count("* as count")
        .groupBy("scopeResourceId")
        .as("mc");

      const rows = (await conn(TableName.AgentVaultAccessBundle)
        .whereIn(`${TableName.AgentVaultAccessBundle}.id`, pageIds)
        .leftJoin(
          TableName.AgentVaultService,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .leftJoin(memberCounts, function joinMemberCount() {
          this.on(db.raw(`mc."scopeResourceId" = ??.id::text`, [TableName.AgentVaultAccessBundle]));
        })
        .select(
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("description").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("createdAt").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("updatedAt").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("id").withSchema(TableName.AgentVaultService).as("serviceId"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.raw('COALESCE(mc.count, 0)::int as "memberCount"')
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
        serviceId: string | null;
        hostPattern: string | null;
        memberCount: number;
      }[];

      const byBundle = new Map<string, TAgentVaultAccessBundleListRow>();
      rows.forEach((row) => {
        let bundle = byBundle.get(row.id);
        if (!bundle) {
          bundle = {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            serviceCount: 0,
            hostPatterns: [],
            memberCount: row.memberCount
          };
          byBundle.set(row.id, bundle);
        }
        if (!row.serviceId) return;
        bundle.serviceCount += 1;
        if (row.hostPattern) bundle.hostPatterns.push(...row.hostPattern.split(","));
      });

      // The fan-out query returns page rows in its own order, so the page order is reapplied here.
      const orderOfId = new Map(pageIds.map((id, index) => [id, index]));
      const accessBundles = [...byBundle.values()].sort(
        (a, b) => (orderOfId.get(a.id) ?? 0) - (orderOfId.get(b.id) ?? 0)
      );
      return { accessBundles, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundles" });
    }
  };

  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultAccessBundles | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultAccessBundle).where({ id, projectId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle by id" });
    }
  };

  // Inside addMember's transaction, so a concurrent bundle delete either waits for the grant and reaps
  // it, or leaves nothing to grant to.
  const lockByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultAccessBundles | undefined> => {
    try {
      return await tx(TableName.AgentVaultAccessBundle).where({ id, projectId }).forUpdate().first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault access bundle" });
    }
  };

  const findMembers = async (
    {
      projectId,
      accessBundleId,
      search,
      limit,
      offset
    }: { projectId: string; accessBundleId: string; search?: string; limit: number; offset: number },
    tx?: Knex
  ): Promise<{ members: TAgentVaultAccessBundleMemberDetail[]; totalCount: number }> => {
    try {
      const conn = tx || db.replicaNode();

      const applyFilters = (query: Knex.QueryBuilder) => {
        void query
          .where({ ...grantScope(projectId, accessBundleId), isActive: true })
          .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
          .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
          .leftJoin(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`);

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
          db.ref("scopeResourceId").withSchema(TableName.Membership).as("accessBundleId"),
          db.ref("actorUserId").withSchema(TableName.Membership).as("userId"),
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("identityId"),
          db.ref("actorGroupId").withSchema(TableName.Membership).as("groupId"),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("name").withSchema(TableName.Groups).as("groupName")
        )
        // The id breaks ties: createdAt is the transaction's start time, so a bulk grant leaves a hundred rows
        // sharing one, and offset paging would show some twice and others never.
        .orderBy(`${TableName.Membership}.createdAt`, "asc")
        .orderBy(`${TableName.Membership}.id`, "asc")
        .limit(limit)
        .offset(offset)) as {
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

      const actorOf = (row: (typeof rows)[number]): TAgentVaultAccessBundleActor => {
        if (row.identityId) {
          return { type: AgentVaultMemberType.MachineIdentity, id: row.identityId, name: row.identityName ?? "" };
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
          lastName: row.userLastName
        };
      };

      return {
        members: rows.map((row) => ({
          id: row.id,
          accessBundleId: row.accessBundleId,
          createdAt: row.createdAt,
          actor: actorOf(row)
        })),
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle members" });
    }
  };

  return { ...orm, findForList, findByIdInProject, lockByIdInProject, findMembers };
};
