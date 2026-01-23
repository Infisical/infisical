import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { EHostGroupMembershipFilter } from "./ssh-host-group-types";

export type TSshHostGroupDALFactory = ReturnType<typeof sshHostGroupDALFactory>;

export const sshHostGroupDALFactory = (db: TDbClient) => {
  const sshHostGroupOrm = ormify(db, TableName.SshHostGroup);

  const findSshHostGroupsWithLoginMappings = async (projectId: string, tx?: Knex) => {
    try {
      // First, get all the SSH host groups with their login mappings
      const rows = await (tx || db.replicaNode())(TableName.SshHostGroup)
        .leftJoin(
          TableName.SshHostLoginUser,
          `${TableName.SshHostGroup}.id`,
          `${TableName.SshHostLoginUser}.sshHostGroupId`
        )
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.SshHostGroup}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.SshHostGroup).as("sshHostGroupId"),
          db.ref("projectId").withSchema(TableName.SshHostGroup),
          db.ref("name").withSchema(TableName.SshHostGroup),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        )
        .orderBy(`${TableName.SshHostGroup}.updatedAt`, "desc");

      const hostsGrouped = groupBy(rows, (r) => r.sshHostGroupId);

      const hostGroupIds = Object.keys(hostsGrouped);

      type HostCountRow = {
        sshHostGroupId: string;
        host_count: string;
      };

      const hostCountsQuery = (await (tx ||
        db
          .replicaNode()(TableName.SshHostGroupMembership)
          .select(`${TableName.SshHostGroupMembership}.sshHostGroupId`, db.raw(`count(*) as host_count`))
          .whereIn(`${TableName.SshHostGroupMembership}.sshHostGroupId`, hostGroupIds)
          .groupBy(`${TableName.SshHostGroupMembership}.sshHostGroupId`))) as HostCountRow[];

      const hostCountsMap = hostCountsQuery.reduce<Record<string, number>>((acc, { sshHostGroupId, host_count }) => {
        acc[sshHostGroupId] = Number(host_count);
        return acc;
      }, {});

      return Object.values(hostsGrouped).map((hostRows) => {
        const { sshHostGroupId, name } = hostRows[0];
        const loginMappingGrouped = groupBy(
          hostRows.filter((r) => r.loginUser),
          (r) => r.loginUser
        );
        const loginMappings = Object.entries(loginMappingGrouped).map(([loginUser, entries]) => ({
          loginUser,
          allowedPrincipals: {
            usernames: unique(entries.map((e) => e.username)).filter(Boolean),
            groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
          }
        }));
        return {
          id: sshHostGroupId,
          projectId,
          name,
          loginMappings,
          hostCount: hostCountsMap[sshHostGroupId] ?? 0
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHostGroup}: FindSshHostGroupsWithLoginMappings` });
    }
  };

  const findSshHostGroupByIdWithLoginMappings = async (sshHostGroupId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.SshHostGroup)
        .leftJoin(
          TableName.SshHostLoginUser,
          `${TableName.SshHostGroup}.id`,
          `${TableName.SshHostLoginUser}.sshHostGroupId`
        )
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.SshHostGroup}.id`, sshHostGroupId)
        .select(
          db.ref("id").withSchema(TableName.SshHostGroup).as("sshHostGroupId"),
          db.ref("projectId").withSchema(TableName.SshHostGroup),
          db.ref("name").withSchema(TableName.SshHostGroup),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        );

      if (rows.length === 0) return null;

      const { sshHostGroupId: id, projectId, name } = rows[0];

      const loginMappingGrouped = groupBy(
        rows.filter((r) => r.loginUser),
        (r) => r.loginUser
      );

      const loginMappings = Object.entries(loginMappingGrouped).map(([loginUser, entries]) => ({
        loginUser,
        allowedPrincipals: {
          usernames: unique(entries.map((e) => e.username)).filter(Boolean),
          groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
        }
      }));

      return {
        id,
        projectId,
        name,
        loginMappings
      };
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHostGroup}: FindSshHostGroupByIdWithLoginMappings` });
    }
  };

  const findAllSshHostsInGroup = async ({
    sshHostGroupId,
    offset = 0,
    limit,
    filter
  }: {
    sshHostGroupId: string;
    offset?: number;
    limit?: number;
    filter?: EHostGroupMembershipFilter;
  }) => {
    try {
      const sshHostGroup = await db
        .replicaNode()(TableName.SshHostGroup)
        .where(`${TableName.SshHostGroup}.id`, sshHostGroupId)
        .select("projectId")
        .first();

      if (!sshHostGroup) {
        throw new BadRequestError({
          message: `SSH host group with ID ${sshHostGroupId} not found`
        });
      }

      const query = db
        .replicaNode()(TableName.SshHost)
        .where(`${TableName.SshHost}.projectId`, sshHostGroup.projectId)
        .leftJoin(TableName.SshHostGroupMembership, (bd) => {
          bd.on(`${TableName.SshHostGroupMembership}.sshHostId`, "=", `${TableName.SshHost}.id`).andOn(
            `${TableName.SshHostGroupMembership}.sshHostGroupId`,
            "=",
            db.raw("?", [sshHostGroupId])
          );
        })
        .select(
          db.ref("id").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("sshHostGroupId").withSchema(TableName.SshHostGroupMembership),
          db.ref("createdAt").withSchema(TableName.SshHostGroupMembership).as("joinedGroupAt"),
          db.raw(`count(*) OVER() as total_count`)
        )
        .offset(offset)
        .orderBy(`${TableName.SshHost}.hostname`, "asc");

      if (limit) {
        void query.limit(limit);
      }

      if (filter) {
        switch (filter) {
          case EHostGroupMembershipFilter.GROUP_MEMBERS:
            void query.andWhere(`${TableName.SshHostGroupMembership}.createdAt`, "is not", null);
            break;
          case EHostGroupMembershipFilter.NON_GROUP_MEMBERS:
            void query.andWhere(`${TableName.SshHostGroupMembership}.createdAt`, "is", null);
            break;
          default:
            break;
        }
      }

      const hosts = await query;

      return {
        hosts: hosts.map(({ id, hostname, alias, sshHostGroupId: memberGroupId, joinedGroupAt }) => ({
          id,
          hostname,
          alias,
          isPartOfGroup: !!memberGroupId,
          joinedGroupAt
        })),
        // @ts-expect-error col select is raw and not strongly typed
        totalCount: Number(hosts?.[0]?.total_count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHostGroupMembership}: FindAllSshHostsInGroup` });
    }
  };

  return {
    findSshHostGroupsWithLoginMappings,
    findSshHostGroupByIdWithLoginMappings,
    findAllSshHostsInGroup,
    ...sshHostGroupOrm
  };
};
