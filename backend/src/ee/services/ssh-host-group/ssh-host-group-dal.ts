import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

export type TSshHostGroupDALFactory = ReturnType<typeof sshHostGroupDALFactory>;

export const sshHostGroupDALFactory = (db: TDbClient) => {
  const sshHostGroupOrm = ormify(db, TableName.SshHostGroup);

  const findSshHostGroupsWithLoginMappings = async (projectId: string, tx?: Knex) => {
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
        .where(`${TableName.SshHostGroup}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.SshHostGroup).as("sshHostGroupId"),
          db.ref("projectId").withSchema(TableName.SshHostGroup),
          db.ref("name").withSchema(TableName.SshHostGroup),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping)
        )
        .orderBy(`${TableName.SshHostGroup}.updatedAt`, "desc");

      const hostsGrouped = groupBy(rows, (r) => r.sshHostGroupId);

      return Object.values(hostsGrouped).map((hostRows) => {
        const { sshHostGroupId, name } = hostRows[0];
        const loginMappingGrouped = groupBy(
          hostRows.filter((r) => r.loginUser),
          (r) => r.loginUser
        );
        const loginMappings = Object.entries(loginMappingGrouped).map(([loginUser, entries]) => ({
          loginUser,
          allowedPrincipals: {
            usernames: unique(entries.map((e) => e.username)).filter(Boolean)
          }
        }));
        return {
          id: sshHostGroupId,
          projectId,
          name,
          loginMappings
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
        .where(`${TableName.SshHostGroup}.id`, sshHostGroupId)
        .select(
          db.ref("id").withSchema(TableName.SshHostGroup).as("sshHostGroupId"),
          db.ref("projectId").withSchema(TableName.SshHostGroup),
          db.ref("name").withSchema(TableName.SshHostGroup),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping)
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
          usernames: unique(entries.map((e) => e.username)).filter(Boolean)
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
    limit
  }: {
    sshHostGroupId: string;
    offset?: number;
    limit?: number;
  }) => {
    try {
      const query = db
        .replicaNode()(TableName.SshHostGroupMembership)
        .where(`${TableName.SshHostGroupMembership}.sshHostGroupId`, sshHostGroupId)
        .join(TableName.SshHost, `${TableName.SshHostGroupMembership}.sshHostId`, `${TableName.SshHost}.id`)
        .select(
          db.ref("id").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("createdAt").withSchema(TableName.SshHostGroupMembership).as("joinedGroupAt"),
          db.raw(`count(*) OVER() as total_count`)
        )
        .offset(offset)
        .orderBy(`${TableName.SshHost}.hostname`, "asc");

      if (limit) {
        void query.limit(limit);
      }

      const hosts = await query;

      return {
        hosts: hosts.map(({ id, hostname, alias }) => ({
          id,
          hostname,
          alias
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
