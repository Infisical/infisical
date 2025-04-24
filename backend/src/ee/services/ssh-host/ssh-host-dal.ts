import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

export type TSshHostDALFactory = ReturnType<typeof sshHostDALFactory>;

export const sshHostDALFactory = (db: TDbClient) => {
  const sshHostOrm = ormify(db, TableName.SshHost);

  const findUserAccessibleSshHosts = async (projectIds: string[], userId: string, tx?: Knex) => {
    try {
      const user = await (tx || db.replicaNode())(TableName.Users).where({ id: userId }).select("username").first();

      if (!user) {
        throw new DatabaseError({ name: `${TableName.Users}: UserNotFound`, error: new Error("User not found") });
      }

      const rows = await (tx || db.replicaNode())(TableName.SshHost)
        .leftJoin(TableName.SshHostLoginUser, `${TableName.SshHost}.id`, `${TableName.SshHostLoginUser}.sshHostId`)
        .leftJoin(
          TableName.SshHostLoginUserMapping,
          `${TableName.SshHostLoginUser}.id`,
          `${TableName.SshHostLoginUserMapping}.sshHostLoginUserId`
        )
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.SshHostLoginUserMapping}.userId`)
        .whereIn(`${TableName.SshHost}.projectId`, projectIds)
        .andWhere(`${TableName.SshHostLoginUserMapping}.userId`, userId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        )
        .orderBy(`${TableName.SshHost}.updatedAt`, "desc");

      const grouped = groupBy(rows, (r) => r.sshHostId);
      return Object.values(grouped).map((hostRows) => {
        const { sshHostId, hostname, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId, projectId } = hostRows[0];

        const loginMappingGrouped = groupBy(hostRows, (r) => r.loginUser);

        const loginMappings = Object.entries(loginMappingGrouped).map(([loginUser]) => ({
          loginUser,
          allowedPrincipals: {
            usernames: [user.username]
          }
        }));

        return {
          id: sshHostId,
          hostname,
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
        .where(`${TableName.SshHost}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        )
        .orderBy(`${TableName.SshHost}.updatedAt`, "desc");

      const hostsGrouped = groupBy(rows, (r) => r.sshHostId);
      return Object.values(hostsGrouped).map((hostRows) => {
        const { sshHostId, hostname, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId } = hostRows[0];

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
          id: sshHostId,
          hostname,
          projectId,
          userCertTtl,
          hostCertTtl,
          loginMappings,
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
        .where(`${TableName.SshHost}.id`, sshHostId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginUser),
          db.ref("username").withSchema(TableName.Users),
          db.ref("userId").withSchema(TableName.SshHostLoginUserMapping),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        );

      if (rows.length === 0) return null;

      const { sshHostId: id, projectId, hostname, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId } = rows[0];

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
        hostname,
        userCertTtl,
        hostCertTtl,
        loginMappings,
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
