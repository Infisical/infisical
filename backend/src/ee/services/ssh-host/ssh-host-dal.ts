import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { LoginMappingSource } from "./ssh-host-types";

export type TSshHostDALFactory = ReturnType<typeof sshHostDALFactory>;

export const sshHostDALFactory = (db: TDbClient) => {
  const sshHostOrm = ormify(db, TableName.SshHost);

  const findUserAccessibleSshHosts = async (projectIds: string[], userId: string, tx?: Knex) => {
    try {
      const knex = tx || db.replicaNode();

      const user = await knex(TableName.Users).where({ id: userId }).select("username").first();

      if (!user) {
        throw new DatabaseError({ name: `${TableName.Users}: UserNotFound`, error: new Error("User not found") });
      }

      // get hosts where user has direct login mappings
      const directHostRows = await knex(TableName.SshHost)
        .leftJoin(TableName.SshHostLoginUser, `${TableName.SshHost}.id`, `${TableName.SshHostLoginUser}.sshHostId`)
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.SshHostLoginUserMapping}.userId`)
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.SshHostLoginUserMapping}.groupId`
        )
        .whereIn(`${TableName.SshHost}.projectId`, projectIds)
        .andWhere((bd) => {
          void bd
            .where(`${TableName.SshHostLoginUserMapping}.userId`, userId)
            .orWhere(`${TableName.UserGroupMembership}.userId`, userId);
        })
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        );

      // get hosts where user has login mappings via host groups
      const groupHostRows = await knex(TableName.SshHostGroupMembership)
        .join(
          TableName.SshHostLoginUser,
          `${TableName.SshHostGroupMembership}.sshHostGroupId`,
          `${TableName.SshHostLoginUser}.sshHostGroupId`
        )
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .join(TableName.SshHost, `${TableName.SshHostGroupMembership}.sshHostId`, `${TableName.SshHost}.id`)
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.SshHostLoginUserMapping}.groupId`
        )
        .whereIn(`${TableName.SshHost}.projectId`, projectIds)
        .andWhere((bd) => {
          void bd
            .where(`${TableName.SshHostLoginUserMapping}.userId`, userId)
            .orWhere(`${TableName.UserGroupMembership}.userId`, userId);
        })
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        );

      const directHostRowsWithSource = directHostRows.map((row) => ({
        ...row,
        source: LoginMappingSource.HOST
      }));

      const groupHostRowsWithSource = groupHostRows.map((row) => ({
        ...row,
        source: LoginMappingSource.HOST_GROUP
      }));

      const mergedRows = [...directHostRowsWithSource, ...groupHostRowsWithSource];

      const hostsGrouped = groupBy(mergedRows, (r) => r.sshHostId);

      return Object.values(hostsGrouped).map((hostRows) => {
        const { sshHostId, hostname, alias, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId, projectId } =
          hostRows[0];

        const loginMappingGrouped = groupBy(hostRows, (r) => r.loginUser);
        const loginMappings = Object.entries(loginMappingGrouped).map(([loginUser, mappings]) => {
          // Prefer HOST source over HOST_GROUP
          const preferredMapping =
            mappings.find((m) => m.source === LoginMappingSource.HOST) ||
            mappings.find((m) => m.source === LoginMappingSource.HOST_GROUP);

          return {
            loginUser,
            allowedPrincipals: {
              usernames: [user.username]
            },
            source: preferredMapping!.source
          };
        });

        return {
          id: sshHostId,
          hostname,
          alias,
          projectId,
          userCertTtl,
          hostCertTtl,
          loginMappings,
          userSshCaId,
          hostSshCaId
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHost}: FindSshHostsWithPrincipalsAcrossProjects` });
    }
  };

  const findSshHostsWithLoginMappings = async (projectId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.SshHost)
        .leftJoin(TableName.SshHostLoginUser, `${TableName.SshHost}.id`, `${TableName.SshHostLoginUser}.sshHostId`)
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.SshHost}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        )
        .orderBy(`${TableName.SshHost}.updatedAt`, "desc");

      // process login mappings inherited from groups that hosts are part of
      const hostIds = unique(rows.map((r) => r.sshHostId)).filter(Boolean);
      const groupRows = await (tx || db.replicaNode())(TableName.SshHostGroupMembership)
        .join(
          TableName.SshHostLoginUser,
          `${TableName.SshHostGroupMembership}.sshHostGroupId`,
          `${TableName.SshHostLoginUser}.sshHostGroupId`
        )
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .select(
          db.ref("sshHostId").withSchema(TableName.SshHostGroupMembership),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        )
        .whereIn(`${TableName.SshHostGroupMembership}.sshHostId`, hostIds);

      const groupedGroupMappings = groupBy(groupRows, (r) => r.sshHostId);

      const hostsGrouped = groupBy(rows, (r) => r.sshHostId);
      return Object.values(hostsGrouped).map((hostRows) => {
        const { sshHostId, hostname, alias, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId } = hostRows[0];

        // direct login mappings
        const loginMappingGrouped = groupBy(
          hostRows.filter((r) => r.loginUser),
          (r) => r.loginUser
        );

        const directMappings = Object.entries(loginMappingGrouped).map(([loginUser, entries]) => ({
          loginUser,
          allowedPrincipals: {
            usernames: unique(entries.map((e) => e.username)).filter(Boolean),
            groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
          },
          source: LoginMappingSource.HOST
        }));

        // group-inherited login mappings
        const inheritedGroupRows = groupedGroupMappings[sshHostId] || [];
        const inheritedGrouped = groupBy(inheritedGroupRows, (r) => r.loginUser);

        const groupMappings = Object.entries(inheritedGrouped).map(([loginUser, entries]) => ({
          loginUser,
          allowedPrincipals: {
            usernames: unique(entries.map((e) => e.username)).filter(Boolean),
            groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
          },
          source: LoginMappingSource.HOST_GROUP
        }));

        return {
          id: sshHostId,
          hostname,
          alias,
          projectId,
          userCertTtl,
          hostCertTtl,
          loginMappings: [...directMappings, ...groupMappings],
          userSshCaId,
          hostSshCaId
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHost}: FindSshHostsWithLoginMappings` });
    }
  };

  const findSshHostByIdWithLoginMappings = async (sshHostId: string, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.SshHost)
        .leftJoin(TableName.SshHostLoginUser, `${TableName.SshHost}.id`, `${TableName.SshHostLoginUser}.sshHostId`)
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.SshHost}.id`, sshHostId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("alias").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        );

      if (rows.length === 0) return null;

      const { sshHostId: id, projectId, hostname, alias, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId } = rows[0];

      // direct login mappings
      const directGrouped = groupBy(
        rows.filter((r) => r.loginUser),
        (r) => r.loginUser
      );

      const directMappings = Object.entries(directGrouped).map(([loginUser, entries]) => ({
        loginUser,
        allowedPrincipals: {
          usernames: unique(entries.map((e) => e.username)).filter(Boolean),
          groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
        },
        source: LoginMappingSource.HOST
      }));

      // group login mappings
      const groupRows = await (tx || db.replicaNode())(TableName.SshHostGroupMembership)
        .join(
          TableName.SshHostLoginUser,
          `${TableName.SshHostGroupMembership}.sshHostGroupId`,
          `${TableName.SshHostLoginUser}.sshHostGroupId`
        )
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.SshHostLoginUserMapping}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Groups, `${TableName.SshHostLoginUserMapping}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.SshHostGroupMembership}.sshHostId`, sshHostId)
        .select(
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug")
        );

      const groupGrouped = groupBy(
        groupRows.filter((r) => r.loginUser),
        (r) => r.loginUser
      );

      const groupMappings = Object.entries(groupGrouped).map(([loginUser, entries]) => ({
        loginUser,
        allowedPrincipals: {
          usernames: unique(entries.map((e) => e.username)).filter(Boolean),
          groups: unique(entries.map((e) => e.groupSlug)).filter(Boolean)
        },
        source: LoginMappingSource.HOST_GROUP
      }));

      return {
        id,
        projectId,
        hostname,
        alias,
        userCertTtl,
        hostCertTtl,
        loginMappings: [...directMappings, ...groupMappings],
        userSshCaId,
        hostSshCaId
      };
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SshHost}: FindSshHostByIdWithLoginMappings` });
    }
  };

  return {
    ...sshHostOrm,
    findSshHostsWithLoginMappings,
    findUserAccessibleSshHosts,
    findSshHostByIdWithLoginMappings
  };
};
