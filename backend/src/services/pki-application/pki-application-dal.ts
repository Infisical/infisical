import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { RESOURCE_SCOPE, ResourceType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import { TPkiApplicationListItem } from "./pki-application-types";

export type TPkiApplicationDALFactory = ReturnType<typeof pkiApplicationDALFactory>;

export const pkiApplicationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiApplication);

  const findByNameAndProjectId = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const row = await (tx || db.replicaNode())(TableName.PkiApplication).where({ name, projectId }).first();
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find pki application by name and project id" });
    }
  };

  const findByProjectId = async (
    projectId: string,
    options: {
      search?: string;
      limit?: number;
      offset?: number;
      applicationIds?: string[];
    } = {},
    tx?: Knex
  ): Promise<TPkiApplicationListItem[]> => {
    try {
      const { search, limit = 20, offset = 0, applicationIds } = options;
      const knex = tx || db.replicaNode();

      const profileCountSub = knex(TableName.PkiApplicationProfile)
        .select("applicationId")
        .count<{ applicationId: string; count: string }[]>("* as count")
        .groupBy("applicationId")
        .as("pc");

      const memberCountSub = knex(TableName.Membership)
        .select("scopeResourceId")
        .where("scope", RESOURCE_SCOPE)
        .andWhere("scopeProjectId", projectId)
        .andWhere("scopeResourceType", ResourceType.CertificateApplication)
        .count<{ scopeResourceId: string; count: string }[]>("* as count")
        .groupBy("scopeResourceId")
        .as("mc");

      const certCountSub = knex(TableName.Certificate)
        .select("applicationId")
        .whereNotNull("applicationId")
        .count<{ applicationId: string; count: string }[]>("* as count")
        .groupBy("applicationId")
        .as("cc");

      let query = knex(TableName.PkiApplication)
        .leftJoin(profileCountSub, "pc.applicationId", `${TableName.PkiApplication}.id`)
        .leftJoin(memberCountSub, function joinMemberCount() {
          this.on(knex.raw(`mc."scopeResourceId" = ${TableName.PkiApplication}.id::text`));
        })
        .leftJoin(certCountSub, "cc.applicationId", `${TableName.PkiApplication}.id`)
        .where(`${TableName.PkiApplication}.projectId`, projectId)
        .select(
          `${TableName.PkiApplication}.id`,
          `${TableName.PkiApplication}.projectId`,
          `${TableName.PkiApplication}.name`,
          `${TableName.PkiApplication}.description`,
          `${TableName.PkiApplication}.createdAt`,
          `${TableName.PkiApplication}.updatedAt`,
          knex.raw('COALESCE(pc.count, 0)::int as "profileCount"'),
          knex.raw('COALESCE(mc.count, 0)::int as "memberCount"'),
          knex.raw('COALESCE(cc.count, 0)::int as "certificateCount"')
        )
        .orderBy(`${TableName.PkiApplication}.createdAt`, "desc")
        .limit(limit)
        .offset(offset);

      if (search) {
        const sanitized = sanitizeSqlLikeString(search);
        query = query.where((qb) => {
          void qb
            .whereILike(`${TableName.PkiApplication}.name`, `%${sanitized}%`)
            .orWhereILike(`${TableName.PkiApplication}.description`, `%${sanitized}%`);
        });
      }

      if (applicationIds) {
        query = query.whereIn(`${TableName.PkiApplication}.id`, applicationIds);
      }

      const rows = (await query) as TPkiApplicationListItem[];
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "List pki applications by project id" });
    }
  };

  const countByProjectId = async (
    projectId: string,
    search?: string,
    tx?: Knex,
    applicationIds?: string[]
  ): Promise<number> => {
    try {
      let query = (tx || db.replicaNode())(TableName.PkiApplication).where({ projectId });
      if (search) {
        const sanitized = sanitizeSqlLikeString(search);
        query = query.where((qb) => {
          void qb.whereILike("name", `%${sanitized}%`).orWhereILike("description", `%${sanitized}%`);
        });
      }
      if (applicationIds) {
        query = query.whereIn("id", applicationIds);
      }
      const result = await query.count("*").first();
      return parseInt((result as unknown as { count: string }).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count pki applications by project id" });
    }
  };

  return {
    ...orm,
    findByNameAndProjectId,
    findByProjectId,
    countByProjectId
  };
};
