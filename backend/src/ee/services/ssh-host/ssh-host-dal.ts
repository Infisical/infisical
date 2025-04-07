import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

export type TSshHostDALFactory = ReturnType<typeof sshHostDALFactory>;

export const sshHostDALFactory = (db: TDbClient) => {
  const sshHostOrm = ormify(db, TableName.SshHost);

  const findSshHostsWithPrincipalsAcrossProjects = async (projectIds: string[], principals: string[], tx?: Knex) => {
    try {
      const matchingSshHosts = await (tx || db.replicaNode())(TableName.SshHost)
        .leftJoin(
          TableName.SshHostLoginMapping,
          `${TableName.SshHost}.id`,
          `${TableName.SshHostLoginMapping}.sshHostId`
        )
        .whereIn(`${TableName.SshHost}.projectId`, projectIds)
        .whereRaw(`"${TableName.SshHostLoginMapping}"."allowedPrincipals" && ?::text[]`, [principals])
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginMapping),
          db.ref("allowedPrincipals").withSchema(TableName.SshHostLoginMapping),
          db.ref("userSshCaId").withSchema(TableName.SshHost),
          db.ref("hostSshCaId").withSchema(TableName.SshHost)
        )
        .orderBy(`${TableName.SshHost}.updatedAt`, "desc");

      const grouped = groupBy(matchingSshHosts, (r) => r.sshHostId);
      return Object.values(grouped).map((hostRows) => {
        const { sshHostId, hostname, userCertTtl, hostCertTtl, userSshCaId, hostSshCaId, projectId } = hostRows[0];

        const loginMappingGrouped = groupBy(
          hostRows.filter((r) => r.loginUser),
          (r) => r.loginUser
        );

        const loginMappings = Object.entries(loginMappingGrouped)
          .map(([loginUser, entries]) => {
            const filteredPrincipals = unique(entries.flatMap((entry) => entry.allowedPrincipals ?? [])).filter(
              (principal) => principals.includes(principal)
            );

            if (filteredPrincipals.length === 0) return null;

            return {
              loginUser,
              allowedPrincipals: filteredPrincipals
            };
          })
          .filter(Boolean) as { loginUser: string; allowedPrincipals: string[] }[];

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
        .leftJoin(
          TableName.SshHostLoginMapping,
          `${TableName.SshHost}.id`,
          `${TableName.SshHostLoginMapping}.sshHostId`
        )
        .where(`${TableName.SshHost}.projectId`, projectId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginMapping),
          db.ref("allowedPrincipals").withSchema(TableName.SshHostLoginMapping),
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
          allowedPrincipals: unique(entries.flatMap((entry) => entry.allowedPrincipals ?? []))
        }));

        return {
          id: sshHostId,
          projectId,
          hostname,
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
        .leftJoin(
          TableName.SshHostLoginMapping,
          `${TableName.SshHost}.id`,
          `${TableName.SshHostLoginMapping}.sshHostId`
        )
        .where(`${TableName.SshHost}.id`, sshHostId)
        .select(
          db.ref("id").withSchema(TableName.SshHost).as("sshHostId"),
          db.ref("projectId").withSchema(TableName.SshHost),
          db.ref("hostname").withSchema(TableName.SshHost),
          db.ref("userCertTtl").withSchema(TableName.SshHost),
          db.ref("hostCertTtl").withSchema(TableName.SshHost),
          db.ref("loginUser").withSchema(TableName.SshHostLoginMapping),
          db.ref("allowedPrincipals").withSchema(TableName.SshHostLoginMapping),
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
        allowedPrincipals: unique(entries.flatMap((entry) => entry.allowedPrincipals ?? []))
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
    findSshHostsWithPrincipalsAcrossProjects,
    findSshHostsWithLoginMappings,
    findSshHostByIdWithLoginMappings
  };
};
