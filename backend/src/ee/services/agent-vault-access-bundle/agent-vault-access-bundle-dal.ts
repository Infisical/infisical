import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { RESOURCE_SCOPE, ResourceType, TableName, TAgentVaultAccessBundles } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultAccessBundleDALFactory = ReturnType<typeof agentVaultAccessBundleDALFactory>;

export type TAgentVaultAccessBundleListRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  serviceCount: number;
  hostPatterns: string[];
  memberCount: number;
};

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

const grantScope = (projectId: string, accessBundleId?: string) => ({
  scope: RESOURCE_SCOPE,
  scopeProjectId: projectId,
  scopeResourceType: ResourceType.AgentVaultAccessBundle,
  ...(accessBundleId ? { scopeResourceId: accessBundleId } : {})
});

export const agentVaultAccessBundleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultAccessBundle);

  const findWithCounts = async (
    { projectId, accessBundleIds }: { projectId: string; accessBundleIds: string[] | null },
    tx?: Knex
  ): Promise<TAgentVaultAccessBundleListRow[]> => {
    if (accessBundleIds?.length === 0) return [];

    try {
      const conn = tx || db.replicaNode();

      const memberCounts = conn(TableName.Membership)
        .select("scopeResourceId")
        .where({ ...grantScope(projectId), isActive: true })
        .count("* as count")
        .groupBy("scopeResourceId")
        .as("mc");

      const rows = (await conn(TableName.AgentVaultAccessBundle)
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .where((qb) => {
          if (accessBundleIds) void qb.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);
        })
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
          db.ref("id").withSchema(TableName.AgentVaultService).as("serviceId"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.raw('COALESCE(mc.count, 0)::int as "memberCount"')
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
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

      return [...byBundle.values()];
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
    { projectId, accessBundleId }: { projectId: string; accessBundleId: string },
    tx?: Knex
  ): Promise<TAgentVaultAccessBundleMemberDetail[]> => {
    try {
      const rows = (await (tx || db.replicaNode())(TableName.Membership)
        .where({ ...grantScope(projectId, accessBundleId), isActive: true })
        .leftJoin(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .leftJoin(TableName.Groups, `${TableName.Membership}.actorGroupId`, `${TableName.Groups}.id`)
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
        .orderBy(`${TableName.Membership}.createdAt`, "asc")) as {
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

  return { ...orm, findWithCounts, findByIdInProject, lockByIdInProject, findMembers };
};
